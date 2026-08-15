# Plan Entitlements

`lib/plans.ts` is the single source of truth for what each plan can do. All quota and feature enforcement in `lib/quota.ts` reads from `PLAN_ENTITLEMENTS`; nothing else should hardcode plan limits.

Enforcement resolves entitlements through `effectiveEntitlements(account)` in `lib/planGrants.ts`, **not** through `getPlanEntitlements(account.plan)`. `account.plan` is the Stripe-owned billing plan; a workspace may also hold a complimentary grant that raises what it can do. See [Complimentary plans](#complimentary-plans).

## Plans

Plans are seat-based with pooled verification usage: every workspace member shares the account's monthly verification quota, and billable seats are counted per workspace.

`pro`, `team`, and `business` are self-serve Stripe-billed tiers ($20 / $79 / $249 per month). `enterprise` is contact-sales. Unlimited numeric limits use `Infinity` (existing repo convention); `Infinity` serializes to `null` in JSON API responses.

| Entitlement | Free | Pro | Team | Business | Enterprise |
| --- | ---: | ---: | ---: | ---: | ---: |
| Billable seats (`maxBillableUsers`) | 1 | 25 | 50 | 100 | Unlimited |
| Agents (`maxAgents`) | 3 | 50 | 100 | 250 | Unlimited |
| Protected repos (`maxProtectedRepos`) | 1 | 10 | 25 | 100 | Unlimited |
| Verifications / month (`monthlyVerifications`) | 1,000 | 250,000 | 1,000,000 | 2,000,000 | Unlimited |
| Log retention days (`logRetentionDays`) | 7 | 90 | 90 | 180 | 365 (custom) |
| Webhooks (`webhooksEnabled`) | No | Yes | Yes | Yes | Yes |
| Managed Profiles (`managedProfilesEnabled`) | Yes (basic) | Yes | Yes | Yes | Yes |
| Required managed profile mode (`requiredManagedProfileModeEnabled`) | Yes | Yes | Yes | Yes | Yes |
| Pause approvals (`pauseApprovalsEnabled`) | Yes | Yes | Yes | Yes | Yes |
| Advanced audit exports (`advancedAuditExportsEnabled`) | No | No | No | Yes | Yes |

Managed Profiles, required mode, and pause approvals predate the entitlement layer and are available on every plan today, including free. The flags mirror that current availability so introducing entitlements does not change Managed Profiles enforcement semantics; future plan changes can gate them in one place. Enterprise log retention is custom per contract and stays a finite number so retention-window date math remains valid.

## Billable seats

Billable roles are the workspace roles that can mutate resources (create agents, approve actions, change settings, run managed profiles): `OWNER`, `ENGINEERING_LEAD`, `SENIOR_ENGINEER`, `ENGINEER`. Read-only roles (`VIEWER`) are never billable. `BILLABLE_WORKSPACE_ROLES` and `isBillableWorkspaceRole` live in `lib/authority.ts`; `countBillableSeats(accountId)` in `lib/quota.ts` counts active billable memberships.

Seat limits are checked when a billable member is added: direct member add, invite creation (`addOrInviteMember`), and invite acceptance (`acceptInvite`). Pending invites do not consume seats; acceptance re-checks the limit, so a burst of invites cannot exceed the cap. Viewer invites are always allowed.

## Enforcement model

Creation limits block **new** resources only:

- Agent creation (`checkAgentLimit`) — `POST /api/agents`, `POST /api/dashboard/agents`, `POST /api/dashboard/agents/first-setup`.
- Protected repo enrollment (`checkProtectedRepoLimit`) — enforced inside `saveManagedProfilePolicy`, covering both `POST /api/dashboard/managed-profiles/protected-repos` and `PUT /api/dashboard/managed-profiles`. Only growth of the protected repo list is blocked; editing or shrinking an over-limit policy always saves.
- Webhook creation and re-enable (`checkWebhooksEnabled`) — `POST /api/dashboard/webhooks`, `POST /api/dashboard/webhooks/[webhookId]/enable`.
- Billable member add / invite / acceptance (`checkSeatLimit`).
- Metered verifications (`checkAndIncrementVerifications`) — unchanged behavior.

Existing resources are **never deleted or disabled** when a workspace downgrades or is over a limit. A free workspace with 5 agents keeps all 5; it just cannot create a 6th. (Stripe payment failure/downgrade webhooks still disable webhook endpoints, which is billing behavior rather than entitlement enforcement — but they now leave delivery enabled for a workspace whose complimentary grant entitles it to webhooks.)

## Complimentary plans

A complimentary plan is a grant: entitlements a workspace holds without paying for them. Grants are stored in their own columns — `complimentary_plan`, `complimentary_plan_reason`, `complimentary_plan_granted_by`, `complimentary_plan_granted_at`, `complimentary_plan_expires_at` — and never in `account.plan`.

That separation is the whole point. Every branch of the Stripe webhook handler ends in an unconditional write to `account.plan`, and three of them write `"free"`: subscription deleted, invoice payment failed, and a subscription updated to any non-active status. A comp stored in `account.plan` is one webhook away from silent erasure, with no record that it existed. Billing code never writes the complimentary columns, so the overwrite is structurally impossible rather than merely unlikely.

### Resolution

| Function | Use for |
| --- | --- |
| `effectiveEntitlements(account)` | **Anything that gates behaviour.** Per-field maximum of the billing plan and any active grant. |
| `effectivePlan(account)` | Display label only — the higher-ranked of billing and granted plan. |
| `planSource(account)` | `"complimentary"` only when the grant is what raises the plan above billing. |
| `hasActiveComplimentaryPlan(account)` | Guarding billing actions, e.g. refusing checkout. |
| `billingPlan(account)` | The Stripe-owned plan, when you specifically mean what the customer pays for. |

A grant is **strictly additive**: `effectiveEntitlements` takes the per-field maximum, so a grant can never reduce what a workspace already pays for. The current Free → Pro → Team → Business → Enterprise matrix is monotonic on numeric and boolean allowances; the additive overlay remains as defence in depth if a future matrix regresses a field.

A grant with no expiry is a lifetime grant. An expired grant awards nothing but is still reported by `complimentaryGrantView` so operators can see it. `free` is not grantable: it would be a no-op that still read as an active comp.

### Audit

`account_plan_grants` is an append-only ledger. Rows are never updated or deleted — a revocation is a new row, so who comped a workspace, when, why, and on whose authority survives the revocation. Each row records `billing_plan_at_change`, which is what makes a comp distinguishable from a paid upgrade after the fact.

`lib/complimentaryPlans.ts` is the only sanctioned writer. It records the ledger entry **before** applying the account change: there is no cross-backend transaction, so one write must go first, and a recorded-but-unapplied change is discoverable (`getComplimentaryPlanStatus` reports `ledgerMismatch`) where an applied-but-unrecorded entitlement change is not.

### Operating

```bash
npm run plan:comp -- status --account-id acct_...
npm run plan:comp -- grant  --account-id acct_... --plan pro \
    --reason "Lifetime early-tester grant" --expires lifetime --dry-run
npm run plan:comp -- grant  --account-id acct_... --plan pro \
    --reason "Lifetime early-tester grant" --expires lifetime --confirm
npm run plan:comp -- revoke --account-id acct_... --reason "Converted to paid" --confirm
```

`--reason` and an actor (`--actor` or `$OPERATOR`) are required; both land in the ledger. `--expires` must be given explicitly on a grant — silence would mean "lifetime", which is too consequential to be a default. The tool is backend-neutral and follows `BEHALFID_REPOSITORY_BACKEND`.

Do **not** use `npm run account:set-plan` to comp a workspace. That tool writes `account.plan` and warns, correctly, that Stripe webhooks may later overwrite it. It remains available for assigning `enterprise` (or recovering billing state) when Stripe is not the path.

### Effects on other surfaces

- **Checkout** refuses while a grant is active, so a comped customer cannot start a paid subscription for entitlements they already hold.
- **Webhook delivery** is kept enabled through a cancellation or failed invoice when the grant still entitles the workspace to webhooks.
- **Log purge** buckets accounts by effective plan. Grouping by `account.plan` would delete a comped workspace's logs on the free-tier seven-day window while the product showed ninety days.
- **Console analytics** report the effective plan, so a comped workspace does not read as "free".

## Error codes

Denials return structured errors via `quotaErrorDetails`: `code`, `currentPlan`, `limit`, `upgradeHint`.

| Code | Meaning |
| --- | --- |
| `ACCOUNT_CONTEXT_MISSING` | Metered check ran without an account id (fails closed, issue #77). |
| `AGENT_LIMIT_REACHED` | Agent creation blocked at the plan limit. |
| `VERIFICATION_LIMIT_REACHED` | Monthly verification quota exhausted. |
| `SEAT_LIMIT_REACHED` | Adding a billable member blocked at the plan seat limit. |
| `PROTECTED_REPO_LIMIT_REACHED` | Protected repo enrollment blocked at the plan limit. |
| `WEBHOOKS_REQUIRE_PRO` | Webhooks need a paid plan. Preserved historical code (equivalent of `WEBHOOKS_REQUIRE_PAID_PLAN`). |
| `MANAGED_PROFILES_REQUIRE_PAID_PLAN` | Reserved: cannot trigger today because every plan has Managed Profiles enabled. |
| `REQUIRED_MODE_REQUIRES_PAID_PLAN` | Reserved: cannot trigger today because required mode is enabled on every plan. |

## Out of scope

Stripe checkout, webhooks, and customer portal remain owned by billing code (`app/api/billing/*`, `lib/billingPlans.ts`). Self-serve checkout moves accounts onto `pro`, `team`, or `business` via Stripe Price IDs (`STRIPE_PRO_PRICE_ID`, `STRIPE_TEAM_PRICE_ID`, `STRIPE_BUSINESS_PRICE_ID`); webhooks map subscription metadata / price IDs back to those plans (or `free` on cancel / payment failure). Enterprise remains contact-sales. The entitlement layer reads what Stripe writes and adds complimentary grants on top; it never writes billing state.

## Data access (repository boundary)

A thin repository layer under `lib/repositories/` now wraps selected Mongoose operations used by quota, dashboard summary, membership, and managed-profile code paths. Mongo remains the backing store; this is preparation for a future Postgres/Supabase cutover described in the migration plan. No behavior or data migration has occurred — repositories delegate to the existing models unchanged.
