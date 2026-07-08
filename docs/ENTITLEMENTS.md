# Plan Entitlements

`lib/plans.ts` is the single source of truth for what each plan can do. All quota and feature enforcement in `lib/quota.ts` reads from `PLAN_ENTITLEMENTS` via `getPlanEntitlements(plan)`; nothing else should hardcode plan limits.

## Plans

Plans are seat-based with pooled verification usage: every workspace member shares the account's monthly verification quota, and billable seats are counted per workspace.

`pro` is the legacy Stripe-billed paid plan and keeps its historical limits. `team` and `business` are internal tiers introduced ahead of Stripe/checkout support; nothing assigns them automatically yet. Unlimited numeric limits use `Infinity` (existing repo convention); `Infinity` serializes to `null` in JSON API responses.

| Entitlement | Free | Pro (legacy) | Team | Business | Enterprise |
| --- | ---: | ---: | ---: | ---: | ---: |
| Billable seats (`maxBillableUsers`) | 1 | 25 | 25 | 100 | Unlimited |
| Agents (`maxAgents`) | 3 | 50 | 25 | 250 | Unlimited |
| Protected repos (`maxProtectedRepos`) | 1 | 10 | 10 | 100 | Unlimited |
| Verifications / month (`monthlyVerifications`) | 10,000 | 250,000 | 250,000 | 2,000,000 | Unlimited |
| Log retention days (`logRetentionDays`) | 7 | 90 | 30 | 180 | 365 (custom) |
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

Existing resources are **never deleted or disabled** when a workspace downgrades or is over a limit. A free workspace with 5 agents keeps all 5; it just cannot create a 6th. (The only exception predates this layer: Stripe payment failure/downgrade webhooks disable webhook endpoints, which is billing behavior, not entitlement enforcement.)

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

Stripe integration, checkout, payment state, and plan purchase flows are intentionally untouched by the entitlement layer. Stripe webhooks still only move accounts between `free` and `pro`; `team` and `business` have no purchase path yet.

## Data access (repository boundary)

A thin repository layer under `lib/repositories/` now wraps selected Mongoose operations used by quota, dashboard summary, membership, and managed-profile code paths. Mongo remains the backing store; this is preparation for a future Postgres/Supabase cutover described in the migration plan. No behavior or data migration has occurred — repositories delegate to the existing models unchanged.
