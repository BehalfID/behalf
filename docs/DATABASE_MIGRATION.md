# Database Migration Plan: MongoDB/Mongoose → Supabase/Postgres (v1)

**Status:** Active migration plan. Postgres schema v1 (Drizzle + SQL migrations) exists but is
**not wired to runtime** — Mongo/Mongoose remains the production backing store. See
`docs/POSTGRES_SCHEMA.md` and `lib/db/postgres/`.

**Scope of this document:** feasibility analysis, target schema design, and a phased
migration sequence. It deliberately does **not** introduce Supabase client code, change
auth, billing/quota enforcement, SDK behavior, or Managed Profiles behavior.

---

## 1. Decision summary

| Question | Answer |
|---|---|
| Should we migrate to Supabase/Postgres? | **Yes, likely the right long-term direction.** The data is already highly relational (accounts → memberships → users, agents → permissions → logs, approvals keyed by tuples). We enforce uniqueness, joins, and count-based limits in application code today; Postgres makes those constraints declarative and transactional. |
| Should we migrate now (big-bang)? | **No.** Do not do a big-bang rewrite. The app has ~26 models, hot verify/CLI paths, fail-closed quota logic, and Stripe billing state all coupled to Mongoose. Migrate incrementally behind a repository boundary (see §4 and §14). |
| Should we use Supabase Auth now? | **No.** Keep the current session/cookie + hashed-token auth (`DeveloperUser`, `DeveloperSession`, `DeveloperApiToken`, device codes). Auth migration is a separate, later project. Replacing the database and auth in the same effort multiplies risk; the current auth tables port cleanly to Postgres unchanged. |
| Safest first implementation PR after this plan? | **A repository/data-access boundary around the existing Mongo models** (PR A in §14). Zero behavior change, pure refactor, unit-testable, and it is the prerequisite for every later step. |

---

## 2. Current state: Mongo/Mongoose model inventory

All models live in `models/*.ts`, use string public IDs from `lib/ids.ts`
(`createPublicId(prefix)` → `prefix_<16-char base64url>`), and connect through the
cached singleton in `lib/db.ts` (`MONGODB_URI`, `bufferCommands: false`). Mongoose also
assigns an internal `_id` ObjectId that is never exposed through APIs.

### 2.1 Core tenancy & identity

| Model | Key fields | Notes |
|---|---|---|
| `Account` | `accountId` (unique), `name`, `accountType`, `plan`, Stripe fields (`stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`, `stripeTrialEnd`, `stripeCurrentPeriodEnd`), `verificationCount`, `verificationPeriodStart`, `onboarding` (nested) | Tenant root. Holds billing/quota state mutated by `lib/quota.ts` (`$inc`) and `app/api/billing/webhook`. |
| `DeveloperUser` | `userId` (unique), `email` (unique), `passwordHash` (select:false), verification/reset token hashes, `primaryAccountId`, profile fields | Human identity. Several `select: false` secret columns. |
| `DeveloperSession` | `sessionId` (unique), `userId`, `tokenHash` (unique), `expiresAt`, `activeAccountId` | **TTL index** on `expiresAt` (`expireAfterSeconds: 0`). |
| `DeveloperApiToken` | `tokenId` (unique), `userId`, `accountId`, `tokenHash` (unique, select:false), `tokenPreview`, `lastUsedAt` | CLI/dev tokens (`bhf_dev_…`). |
| `AccountMembership` | `membershipId` (unique), `accountId`, `userId`, `role` | Unique compound `(accountId, userId)`. Roles: OWNER…VIEWER (`lib/authority.ts`). |
| `AccountInvite` | `inviteId` (unique), `accountId`, `email`, `role`, `status`, `inviteTokenHash`, `invitedBy`, `acceptedByUserId` | Unique compound `(accountId, email, status)`; upserted in `lib/membershipManagement.ts`. |
| `DeviceCode` | `codeId`, `deviceCode`, `userCode` (all unique), `status`, `userId`, `sessionToken`, `expiresAt` | CLI device-auth flow. **TTL index** on `expiresAt`. |

### 2.2 Agents, permissions, verification

| Model | Key fields | Notes |
|---|---|---|
| `Agent` | `agentId` (unique), `accountId`, `developerUserId`, `agentType`, `provider`, `apiKeyHash` (select:false), passport token fields, `status` | `accountId` optional for legacy rows; backfilled by `lib/account.ts`. |
| `Permission` | `permissionId` (unique), `accountId`, `agentId`, `action`, `allowedActions[]`, `blockedActions[]`, `constraints` (nested: `maxAmount`, `allowedVendors[]`, `expiresAt`, `allowedPaths[]`, `deniedPaths[]`, `deniedCommands[]`), `requiresApproval`, `requiredAuthorityLevel`, `status` | Hot-path `$or` array queries in `lib/verify.ts`. 3 compound indexes. |
| `PermissionProfile` | `profileId` (unique), `accountId`, `name`, `permissions[]` (embedded sub-docs), `requiredAuthorityLevel`, `status` | Template applied via `lib/permissionMutations.ts`. |
| `ApprovalRequest` | `approvalId`, `requestId` (both unique), `kind` (`agent_action` \| `managed_profile_pause`), tuple fields (`agentId`, `permissionId`, `action`, `vendor`, `amount`), CLI pause fields (`pauseTool`, `pauseRepo`, `pauseScope`, `pauseDeviceId`, …), `status`, `grantExpiresAt`, `requiredAuthorityLevel` | Idempotent pending upsert on the request tuple (`lib/verify.ts`, `lib/managedProfilePauseApproval.ts`). 4 compound indexes. |
| `VerificationLog` | `logId`, `requestId` (both unique), `accountId`, `agentId`, `permissionId`, `action`, `allowed`, `reason`, `risk`, `metadata` (Mixed), `shadow` | **Highest-volume collection.** Append-only. Aggregation pipeline in `lib/verificationLogs.ts` (`$facet`, `$regexMatch`). |

### 2.3 Webhooks & billing

| Model | Key fields | Notes |
|---|---|---|
| `WebhookEndpoint` | `webhookId` (unique), `accountId`, `url`, `secretHash` (select:false), `events[]`, `status` | Bulk enabled/disabled by billing webhook on plan change. |
| `WebhookEvent` | `eventId` (unique), `accountId`, `type`, `payload` (Mixed), `status`, `attempts`, `nextAttemptAt`, `deadLetter` | Queue table. Worker claims via `findOneAndUpdate` + `$inc attempts` (`lib/webhookWorker.ts`). |
| `WebhookDelivery` | `deliveryId` (unique), `webhookId`, `eventId`, `status`, `httpStatus`, `attempt` | Append-only delivery history, `insertMany` by worker. |
| `StripeWebhookEvent` | `eventId` (unique), `type`, `processedAt` | Stripe idempotency ledger; dedupe via unique index + duplicate-key catch. |
| `EnterpriseInquiry` | `inquiryId` (unique), contact fields, `status` | Sales inbox. |

### 2.4 Managed Profiles / CLI

| Model | Key fields | Notes |
|---|---|---|
| `ManagedProfilePolicy` | `policyId` (unique), `accountId` (**unique** — one policy per account), `timezone`, `enabled`, `workHours` (nested), mode fields, `toolModes` (nested), `protectedRepos[]` (embedded sub-docs), `pausePolicy` (nested) | Full-document replace upsert in `lib/managedProfilePolicy.ts`. Protected-repo count gated by `checkProtectedRepoLimit`. |
| `CliPauseLease` | `leaseId` (unique), `accountId`, `userId`, `deviceId`, `tool`, `repo`, `scope`, `granted`, `mode`, `expiresAt` | Active lease = `expiresAt > now` (no TTL index; app-level expiry). |
| `CliAuditLog` | `auditId` (unique), `accountId`, `userId`, `eventType`, `tool`, `repo`, `mode`, `granted`, `reason`, `metadata` (Mixed) | Append-only Managed Profile activity feed (surfaced by `lib/cliAuditActivity.ts`). Second-highest-volume growth. |

### 2.5 Site Guard & status page

| Model | Key fields | Notes |
|---|---|---|
| `Site` | `siteId` (unique), `accountId`, `domain`, `status` | Unique `(accountId, domain)`. |
| `SiteAccessRule` | `ruleId` (unique), `siteId`, `accountId`, path arrays, `requiresApproval` | Rules matched in memory in `lib/siteGuard.ts`. |
| `SiteAccessLog` | `requestId` (unique), `siteId`, `accountId`, `allowed`, `reason`, `risk` | Append-only, high volume. |
| `SiteGuardKey` | `keyId` (unique), `siteId`, `accountId`, `keyHash` (unique, select:false), `status` | |
| `StatusComponent` | `componentId` (unique), `name`, `group`, `status`, `enabled` | Global (not tenant-scoped). |
| `StatusIncident` | `incidentId` (unique), `title`, `status`, `severity`, `componentIds[]`, `updates[]` (embedded sub-docs) | Global. |

### 2.6 Mongo-specific behaviors the migration must account for

Verified against current call sites:

- **No multi-document transactions anywhere.** No `startSession`/`withTransaction` usage.
  Invariants (quota counters, invite acceptance, approval consumption) rely on
  single-document atomicity plus unique-index race handling (catching Mongo error 11000
  in `lib/inviteAcceptance.ts` and `lib/delegatedAuth.ts`).
- **Atomic upserts** (`findOneAndUpdate` + `upsert` + `$setOnInsert`): approval-request
  dedupe (`lib/verify.ts`), CLI pause approval dedupe (`lib/managedProfilePauseApproval.ts`),
  pending invite refresh (`lib/membershipManagement.ts`), OWNER membership bootstrap
  (`lib/delegatedAuth.ts`), one-policy-per-account replace (`lib/managedProfilePolicy.ts`),
  webhook event claim (`lib/webhookWorker.ts`).
- **Atomic counters** (`$inc`): `Account.verificationCount` (`lib/quota.ts`),
  `WebhookEvent.attempts` (`lib/webhookWorker.ts`).
- **TTL indexes**: `DeveloperSession.expiresAt`, `DeviceCode.expiresAt`,
  `OAuthPendingSignup.expiresAt`. Postgres has no TTL; Phase B′ ships
  `behalf_purge_expired_*` + `behalf_run_ttl_cleanup` / `behalf_schedule_ttl_cleanup`
  (enable `pg_cron` as an operator step). App code already double-checks
  expiry timestamps, so lazy deletion is safe.
- **Aggregation pipelines** (2 sites): verification stats `$facet` in
  `lib/verificationLogs.ts`; 14-day daily counts in `app/api/console/summary/route.ts`.
  Both translate to plain SQL `GROUP BY`.
- **`Schema.Types.Mixed`** free-form fields: `WebhookEvent.payload`,
  `VerificationLog.metadata`, `CliAuditLog.metadata` → JSONB.
- **Array queries**: `lib/verify.ts` matches `action` against `allowedActions`/`blockedActions`
  arrays with `$or`; `$in` lookups are used as application-level joins everywhere
  (`membershipManagement.listAccountMembers`, `verificationLogs.withAgentNames`, inbox route).
- **Fire-and-forget writes**: `lastUsedAt` updates on Agent/API token/site-guard key are
  unawaited; acceptable in Postgres too, but must not hold a pooled connection open.
- **Raw driver usage**: only `scripts/cleanup-demo-data.ts` (bulk `collection.deleteMany`).

---

## 3. Where the database is touched (call-site survey)

Every route handler calls `connectToDatabase()` (directly or via `requireDeveloperApi` /
`requireCliAuth`) and then uses Mongoose models directly or through `lib/*` helpers.
There is **no existing data-access layer** — this is the main refactor target.

| Feature area | Entry points | Models touched |
|---|---|---|
| Auth (cookie/session, device flow) | `app/api/auth/**`, `lib/developerAuth.ts`, `lib/humanAuth.ts`, `lib/delegatedAuth.ts` | DeveloperUser, DeveloperSession, DeviceCode, Account, AccountMembership |
| Verify / SDK (hot path) | `app/api/verify/route.ts`, `app/api/actions/execute/route.ts`, `lib/auth.ts`, `lib/verify.ts`, `lib/quota.ts`, `lib/webhooks.ts` | Agent, DeveloperApiToken, Account, Permission, ApprovalRequest, VerificationLog, WebhookEvent |
| Approvals | `app/api/dashboard/approvals/**`, `app/api/dashboard/inbox`, `lib/managedProfilePauseApproval.ts` | ApprovalRequest, Agent, DeveloperUser, VerificationLog |
| Dashboard | `app/api/dashboard/**`, `lib/dashboardData.ts`, `lib/accountDashboardData.ts`, `lib/membershipManagement.ts`, `lib/inviteAcceptance.ts` | most models |
| Billing | `app/api/billing/**`, `lib/quota.ts`, `lib/plans.ts` (pure), `lib/stripe.ts` (no models) | Account, StripeWebhookEvent, WebhookEndpoint, EnterpriseInquiry |
| Webhook queue | `app/api/webhooks/process`, `lib/webhookWorker.ts` | WebhookEvent, WebhookEndpoint, WebhookDelivery |
| Managed Profiles / CLI | `app/api/cli/**`, `app/api/dashboard/managed-profiles/**`, `lib/managedProfilePolicy.ts`, `lib/cliSessionPolicy.ts`, `lib/cliAuditActivity.ts` | ManagedProfilePolicy, CliPauseLease, CliAuditLog, Account, ApprovalRequest |
| Site Guard | `app/api/site-guard/check`, `app/api/dashboard/sites/**`, `lib/siteGuard.ts`, `lib/siteGuardKey.ts` | Site, SiteAccessRule, SiteAccessLog, SiteGuardKey |
| Status page | `app/api/status`, `app/api/console/status/**` | StatusComponent, StatusIncident |
| Console (internal admin) | `app/api/console/**`, `lib/consoleData.ts` | broad read access |
| Scripts | `scripts/cleanup-demo-data.ts`, `scripts/dev/*`, `scripts/seed-*` | broad |

Hot-path query budgets (per request, from code inspection):

- `POST /api/verify`: agent auth lookup → quota read+`$inc` → permission `$or` fetch →
  optional approval upsert/consume → `VerificationLog.create` → `WebhookEvent.create`
  (~6–9 queries).
- `POST /api/cli/session-policy`: session auth → active lease scan → account read →
  policy read → audit insert (~5 queries).
- `GET /api/webhooks/process`: recover stuck → claim loop → endpoint fetch → delivery
  `insertMany` → event finalize.

---

## 4. Target architecture recommendation

### 4.1 Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Direct `@supabase/supabase-js` (PostgREST)** | Zero SQL migration tooling needed; RLS-native; good for client-side reads | All our access is **server-side** with complex conditional queries, upserts with tuple conflict targets, queue claims (`SKIP LOCKED`), and multi-statement transactions — PostgREST is a poor fit; adds an HTTP hop per query on hot paths | ❌ Not as the primary data layer. Fine later for narrowly-scoped client reads, if ever. |
| **Prisma** | Mature migrations, typed client, wide adoption | Heavier runtime; schema DSL separate from SQL; historically awkward with partial/expression indexes and `SKIP LOCKED` (needs `$queryRaw`); slower cold starts in serverless | ⚠️ Workable but not the best fit. |
| **Drizzle ORM** | TypeScript-first schema colocated with code; thin runtime (~no engine); SQL-transparent (partial indexes, `ON CONFLICT`, `FOR UPDATE SKIP LOCKED` all first-class); `drizzle-kit` generates plain SQL migrations we can review; works over `pg`/`postgres.js`/Supabase pooler | Younger ecosystem than Prisma; migrations require discipline | ✅ **Recommended query builder.** |
| **node-postgres (`pg`) / `postgres.js` raw** | Maximum control, no abstraction | Hand-written SQL + hand-rolled row mapping for ~26 tables; no type inference; higher defect risk during a large port | ⚠️ Use as the **driver underneath** Drizzle, not standalone. |
| **Repository layer over the chosen client** | Isolates all persistence behind interfaces; lets Mongo and Postgres implementations coexist during migration; makes per-table cutover and dual-read verification possible; already matches how `lib/*` half-encapsulates models | Upfront refactor cost; discipline needed to keep query logic out of routes | ✅ **Required regardless of client choice.** |

### 4.2 Recommendation for this repo

1. **Introduce a repository/data-access layer first** (`lib/repositories/*` or `lib/data/*`),
   with one interface per aggregate (e.g. `AccountsRepo`, `AgentsRepo`, `PermissionsRepo`,
   `VerificationLogsRepo`, `ApprovalsRepo`, `WebhookQueueRepo`, `ManagedProfilesRepo`, …).
   The first implementation wraps the **existing Mongoose models with zero behavior change**.
   Routes and `lib/*` helpers call repositories instead of models directly.
2. **Choose Drizzle over `postgres.js`** (or `pg`) as the Postgres client for the second
   implementation, connecting through the **Supabase connection pooler in transaction mode**
   (serverless-friendly; mirrors the current `globalThis` connection-cache pattern in
   `lib/db.ts`).
3. **Keep current auth untouched.** Sessions, password hashes, API-token hashes and device
   codes migrate as plain tables. Supabase Auth (GoTrue) is explicitly out of scope; adopting
   it would change cookie semantics, session issuance, and the CLI device flow at the same
   time as the storage swap — exactly the coupled risk we're avoiding.
4. **Migrate the database separately from auth, and never both in one PR.**
5. Per-table cutover is controlled by the repository factory (env-driven), so a table can be
   flipped Mongo→Postgres (and back) without touching call sites.

---

## 5. Target Postgres table inventory

One table per current model, same grain, snake_case names. 26 models → 27 tables
(protected repos are promoted out of `ManagedProfilePolicy` into a child table).

| # | Table | Source model | Category |
|---|---|---|---|
| 1 | `accounts` | Account | Tenancy |
| 2 | `developer_users` | DeveloperUser | Identity |
| 3 | `developer_sessions` | DeveloperSession | Identity |
| 4 | `developer_api_tokens` | DeveloperApiToken | Identity |
| 5 | `account_memberships` | AccountMembership | Tenancy |
| 6 | `account_invites` | AccountInvite | Tenancy |
| 7 | `device_codes` | DeviceCode | Identity |
| 8 | `agents` | Agent | Core |
| 9 | `permissions` | Permission | Core |
| 10 | `permission_profiles` | PermissionProfile | Core |
| 11 | `approval_requests` | ApprovalRequest | Core |
| 12 | `verification_logs` | VerificationLog | **Log (high volume)** |
| 13 | `webhook_endpoints` | WebhookEndpoint | Webhooks |
| 14 | `webhook_events` | WebhookEvent | Webhooks (queue) |
| 15 | `webhook_deliveries` | WebhookDelivery | **Log (high volume)** |
| 16 | `stripe_webhook_events` | StripeWebhookEvent | Billing |
| 17 | `enterprise_inquiries` | EnterpriseInquiry | Billing |
| 18 | `managed_profile_policies` | ManagedProfilePolicy | Managed Profiles |
| 19 | `managed_profile_protected_repos` | ManagedProfilePolicy.protectedRepos[] | Managed Profiles (new child table) |
| 20 | `cli_pause_leases` | CliPauseLease | Managed Profiles |
| 21 | `cli_audit_logs` | CliAuditLog | **Log (high volume)** — this is the "cli_audit_activities" / Managed Profile activity table |
| 22 | `sites` | Site | Site Guard |
| 23 | `site_access_rules` | SiteAccessRule | Site Guard |
| 24 | `site_access_logs` | SiteAccessLog | **Log (high volume)** |
| 25 | `site_guard_keys` | SiteGuardKey | Site Guard |
| 26 | `status_components` | StatusComponent | Status (global) |
| 27 | `status_incidents` (+ `status_incident_updates` if normalized; JSONB acceptable) | StatusIncident | Status (global) |

### 5.1 Global schema conventions

- **Primary keys:** keep the existing prefixed public IDs (`acct_…`, `user_…`, `agent_…`)
  as `TEXT PRIMARY KEY`. They are already unique, immutable, and embedded in API
  responses, webhooks, and customer logs. Do **not** introduce a second surrogate key in
  v1 — dual-key schemas complicate the export/import and every FK. (Revisit
  UUIDv7/bigint surrogates later only if index size becomes a measured problem.)
- **Timestamps:** `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`; `updated_at TIMESTAMPTZ
  NOT NULL DEFAULT now()` maintained by a shared trigger (only on tables whose Mongoose
  schema has `timestamps: true` with `updatedAt`). Mongo `createdAt`/`updatedAt` values are
  carried over during import.
- **Enums:** `TEXT` + `CHECK (… IN (…))` constraints rather than native `CREATE TYPE`
  enums, so adding a plan/role/status value stays a one-line migration. Enum value sets
  come verbatim from the Mongoose schemas (e.g. `plan IN ('free','pro','team','business','enterprise')`,
  role set from `lib/authority.ts`).
- **String arrays** (`events`, `allowed_actions`, `guidelines`, `allowed_paths`, …): `TEXT[]`.
- **Free-form documents:** `JSONB` (see §10).
- **Secrets** (`password_hash`, `token_hash`, `api_key_hash`, `secret_hash`, …): normal
  columns; the Mongoose `select: false` convention becomes a repository-layer rule —
  repositories expose "safe" row types by default and secret-bearing reads only through
  explicit methods (mirrors `.select("+field")` today).

---

## 6. Field-by-field mapping — core tables

Types below are the recommended Postgres column types. `PK` = primary key,
`UQ` = unique, `FK` = foreign key, `CK` = check constraint.

### 6.1 `accounts`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `accountId` | `account_id` | `TEXT` | PK |
| `name` | `name` | `TEXT` | NOT NULL, CK `length(name) <= 120` |
| `accountType` | `account_type` | `TEXT` | NULL, CK `IN ('individual','business')` |
| `companyName` | `company_name` | `TEXT` | NULL |
| `website` | `website` | `TEXT` | NULL |
| `teamSize` | `team_size` | `TEXT` | NULL, CK `IN ('1','2-5','6-20','21-50','51+')` |
| `onboarding` (nested) | `onboarding` | `JSONB` | NULL; write-once survey answers, never queried by sub-field |
| `plan` | `plan` | `TEXT` | NOT NULL DEFAULT `'free'`, CK plan enum |
| `stripeCustomerId` | `stripe_customer_id` | `TEXT` | NULL, **UQ** (Mongo has only a sparse non-unique index; the billing webhook looks accounts up by this value, so promote to unique — verify no dupes during export) |
| `stripeSubscriptionId` | `stripe_subscription_id` | `TEXT` | NULL |
| `stripeSubscriptionStatus` | `stripe_subscription_status` | `TEXT` | NULL |
| `stripeTrialEnd` | `stripe_trial_end` | `TIMESTAMPTZ` | NULL |
| `stripeCurrentPeriodEnd` | `stripe_current_period_end` | `TIMESTAMPTZ` | NULL |
| `verificationCount` | `verification_count` | `INTEGER` | NOT NULL DEFAULT 0, CK `>= 0` |
| `verificationPeriodStart` | `verification_period_start` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` |
| `createdAt`/`updatedAt` | `created_at`/`updated_at` | `TIMESTAMPTZ` | NOT NULL |

Quota `$inc` becomes `UPDATE accounts SET verification_count = verification_count + 1
WHERE account_id = $1` — same single-row atomicity as Mongo. The read-check-increment
race in `lib/quota.ts` exists today in Mongo and is unchanged; Postgres additionally
allows closing it later with `UPDATE … WHERE verification_count < $limit RETURNING …`
in one statement (do **not** change semantics during migration).

### 6.2 `developer_users`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `userId` | `user_id` | `TEXT` | PK |
| `email` | `email` | `TEXT` | NOT NULL, **UQ** on `lower(email)` (Mongoose lowercases on write; enforce with `CITEXT` or a unique expression index to be safe against pre-normalization rows) |
| `passwordHash` | `password_hash` | `TEXT` | NOT NULL; repository-restricted read |
| `onboardingUseCase` | `onboarding_use_case` | `TEXT` | NOT NULL DEFAULT `'sdk'`, CK `IN ('personal','website','sdk')` |
| `primaryAccountId` | `primary_account_id` | `TEXT` | NULL, FK → `accounts` (`ON DELETE SET NULL`) |
| `firstName` / `lastName` / `jobTitle` | `first_name` / `last_name` / `job_title` | `TEXT` | NULL |
| `phone` | `phone` | `TEXT` | NULL; repository-restricted read |
| `onboardingCompletedAt` | `onboarding_completed_at` | `TIMESTAMPTZ` | NULL |
| `dateOfBirth` | `date_of_birth` | `DATE` | NULL; stored as ISO string today — parse on import; repository-restricted read |
| `emailVerified` | `email_verified` | `BOOLEAN` | NULL (tri-state is load-bearing: NULL = pre-feature account treated as verified) |
| `emailVerificationTokenHash` / `emailVerificationCodeHash` / `passwordResetTokenHash` | same, snake_case | `TEXT` | NULL; repository-restricted read |
| `emailVerificationTokenExpiresAt` / `passwordResetTokenExpiresAt` | same, snake_case | `TIMESTAMPTZ` | NULL |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

### 6.3 `developer_sessions`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `sessionId` | `session_id` | `TEXT` | PK |
| `userId` | `user_id` | `TEXT` | NOT NULL, FK → `developer_users` (`ON DELETE CASCADE`) |
| `tokenHash` | `token_hash` | `TEXT` | NOT NULL, UQ |
| `expiresAt` | `expires_at` | `TIMESTAMPTZ` | NOT NULL, indexed; **no TTL** — `pg_cron` job deletes expired rows (see Phase B′ TTL helpers); auth code already checks `expires_at > now()` |
| `lastActivityAt` | `last_activity_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` — required in Mongo; sliding inactivity window in `lib/developerAuth.ts` |
| `activeAccountId` | `active_account_id` | `TEXT` | NULL, FK → `accounts` (`ON DELETE SET NULL`) |
| `createdAt` | `created_at` | `TIMESTAMPTZ` | NOT NULL (no `updated_at` — Mongoose disables it) |

### 6.4 `developer_api_tokens`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `tokenId` | `token_id` | `TEXT` | PK |
| `userId` | `user_id` | `TEXT` | NOT NULL, FK → `developer_users` |
| `accountId` | `account_id` | `TEXT` | NOT NULL, FK → `accounts` |
| `name` | `name` | `TEXT` | NOT NULL |
| `tokenPreview` | `token_preview` | `TEXT` | NULL |
| `tokenHash` | `token_hash` | `TEXT` | NOT NULL, UQ; repository-restricted read |
| `lastUsedAt` | `last_used_at` | `TIMESTAMPTZ` | NULL (fire-and-forget update; keep unawaited but ensure the client releases the connection) |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

### 6.5 `account_memberships`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `membershipId` | `membership_id` | `TEXT` | PK |
| `accountId` | `account_id` | `TEXT` | NOT NULL, FK → `accounts` (`ON DELETE CASCADE`) |
| `userId` | `user_id` | `TEXT` | NOT NULL, FK → `developer_users` (`ON DELETE CASCADE`) |
| `role` | `role` | `TEXT` | NOT NULL DEFAULT `'OWNER'`, CK role enum (`OWNER`,`ENGINEERING_LEAD`,`SENIOR_ENGINEER`,`ENGINEER`,`VIEWER`) |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

**UQ `(account_id, user_id)`** — replaces the Mongo compound unique index; the
11000-duplicate-catch in `lib/delegatedAuth.ts`/`lib/inviteAcceptance.ts` becomes
`INSERT … ON CONFLICT (account_id, user_id) DO NOTHING/UPDATE`.

Seat counting (`lib/quota.ts:countBillableSeats`) becomes
`SELECT count(*) WHERE account_id = $1 AND role = ANY($2)` — supported by the
`(account_id, role)` index in §7.

### 6.6 `account_invites`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `inviteId` | `invite_id` | `TEXT` | PK |
| `accountId` | `account_id` | `TEXT` | NOT NULL, FK → `accounts` (`ON DELETE CASCADE`) |
| `email` | `email` | `TEXT` | NOT NULL (lowercased) |
| `role` | `role` | `TEXT` | NOT NULL, CK invite-role enum (no OWNER) |
| `status` | `status` | `TEXT` | NOT NULL DEFAULT `'pending'`, CK `IN ('pending','accepted','revoked')` |
| `inviteTokenHash` | `invite_token_hash` | `TEXT` | NULL, indexed; repository-restricted read |
| `inviteTokenExpiresAt` | `invite_token_expires_at` | `TIMESTAMPTZ` | NULL |
| `acceptedAt` | `accepted_at` | `TIMESTAMPTZ` | NULL |
| `acceptedByUserId` | `accepted_by_user_id` | `TEXT` | NULL, FK → `developer_users` (`ON DELETE SET NULL`) |
| `invitedBy` | `invited_by` | `TEXT` | NOT NULL, FK → `developer_users` |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

**UQ `(account_id, email, status)`** — ports the Mongo unique index verbatim (at most
one pending, one accepted, one revoked row per account+email). The pending-invite
refresh upsert in `lib/membershipManagement.ts` becomes
`INSERT … ON CONFLICT (account_id, email, status) DO UPDATE SET role = …, invite_token_hash = …`.

### 6.7 `agents`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `agentId` | `agent_id` | `TEXT` | PK |
| `accountId` | `account_id` | `TEXT` | **NULL initially**, FK → `accounts`; legacy rows may lack it until `backfillDefaultAccountId` completes — run the backfill to completion in Mongo **before** export, then tighten to NOT NULL |
| `developerUserId` | `developer_user_id` | `TEXT` | NULL, FK → `developer_users` |
| `name` | `name` | `TEXT` | NOT NULL |
| `agentType` | `agent_type` | `TEXT` | NOT NULL DEFAULT `'native'`, CK `IN ('native','connected')` |
| `provider` | `provider` | `TEXT` | NOT NULL DEFAULT `'custom'`, CK provider enum |
| `externalAgentId` / `externalAgentLabel` | snake_case | `TEXT` | NULL |
| `connectionStatus` | `connection_status` | `TEXT` | NOT NULL DEFAULT `'manual'`, CK enum |
| `description` | `description` | `TEXT` | NULL |
| `guidelines[]` | `guidelines` | `TEXT[]` | NOT NULL DEFAULT `'{}'` |
| `publicPassportTokenHash` | `public_passport_token_hash` | `TEXT` | NULL; repository-restricted read |
| `publicPassportTokenPreview` | `public_passport_token_preview` | `TEXT` | NULL |
| `publicPassportEnabled` | `public_passport_enabled` | `BOOLEAN` | NOT NULL DEFAULT false |
| `apiKeyHash` | `api_key_hash` | `TEXT` | NOT NULL, **UQ** (hot-path auth lookup in `lib/auth.ts`; Mongo relies on hash uniqueness implicitly — verify no dupes at export); repository-restricted read |
| `lastUsedAt` / `keyRotatedAt` | snake_case | `TIMESTAMPTZ` | NULL |
| `status` | `status` | `TEXT` | NOT NULL DEFAULT `'active'`, CK `IN ('active','disabled')` |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

### 6.8 `permissions`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `permissionId` | `permission_id` | `TEXT` | PK |
| `accountId` | `account_id` | `TEXT` | NULL (legacy; same backfill note as agents), FK → `accounts` |
| `developerUserId` | `developer_user_id` | `TEXT` | NULL, FK → `developer_users` |
| `agentId` | `agent_id` | `TEXT` | NOT NULL, FK → `agents` (`ON DELETE CASCADE`) |
| `action` | `action` | `TEXT` | NOT NULL |
| `description` / `resource` / `scope` / `notes` | snake_case | `TEXT` | NULL |
| `allowedActions[]` / `blockedActions[]` | `allowed_actions` / `blocked_actions` | `TEXT[]` | NOT NULL DEFAULT `'{}'`; verify hot path becomes `action = $1 OR $1 = ANY(allowed_actions) OR $1 = ANY(blocked_actions)` (GIN index if needed; per-agent permission counts are small, so the `(agent_id, status)` btree likely suffices) |
| `requiresApproval` | `requires_approval` | `BOOLEAN` | NULL |
| `template` | `template` | `TEXT` | NULL, CK template enum |
| `constraints` (nested) | `constraints` | `JSONB` | NULL; shape `{maxAmount, allowedVendors[], expiresAt, allowedPaths[], deniedPaths[], deniedCommands[]}` — evaluated in application code (`lib/verify.ts`), never queried by sub-field → stays JSONB |
| `status` | `status` | `TEXT` | NOT NULL DEFAULT `'active'`, CK `IN ('active','revoked')` |
| `requiredAuthorityLevel` | `required_authority_level` | `SMALLINT` | NULL, CK `BETWEEN 0 AND 100` |
| `createdBy` / `updatedBy` | snake_case | `TEXT` | NULL |
| `lastUsedAt` | `last_used_at` | `TIMESTAMPTZ` | NULL |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

### 6.9 `approval_requests`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `approvalId` | `approval_id` | `TEXT` | PK |
| `requestId` | `request_id` | `TEXT` | NOT NULL, UQ |
| `accountId` | `account_id` | `TEXT` | NULL, FK → `accounts` |
| `developerUserId` | `developer_user_id` | `TEXT` | NULL, FK → `developer_users` |
| `kind` | `kind` | `TEXT` | NOT NULL DEFAULT `'agent_action'`, CK `IN ('agent_action','managed_profile_pause')` |
| `agentId` | `agent_id` | `TEXT` | NULL, FK → `agents` (`ON DELETE SET NULL` — approvals are audit history and must survive agent deletion) |
| `permissionId` | `permission_id` | `TEXT` | NULL, FK → `permissions` (`ON DELETE SET NULL`) |
| `action` | `action` | `TEXT` | NOT NULL |
| `vendor` | `vendor` | `TEXT` | NULL |
| `amount` | `amount` | `NUMERIC` | NULL |
| `pauseTool` / `pauseRepo` / `pauseBranch` / `pauseDeviceId` | snake_case | `TEXT` | NULL |
| `pauseScope` | `pause_scope` | `TEXT` | NULL, CK `IN ('current_repo','all')` |
| `requestedDurationMinutes` | `requested_duration_minutes` | `INTEGER` | NULL, CK `>= 1` |
| `pauseReason` / `contextReason` | snake_case | `TEXT` | NULL |
| `status` | `status` | `TEXT` | NOT NULL DEFAULT `'pending'`, CK `IN ('pending','approved','denied','used')` |
| `resolvedBy` | `resolved_by` | `TEXT` | NULL |
| `resolvedAt` / `grantExpiresAt` | snake_case | `TIMESTAMPTZ` | NULL |
| `requiredAuthorityLevel` | `required_authority_level` | `SMALLINT` | NULL, CK 0–100 |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

**Dedupe upserts:** Mongo `approval_pending_tuple_unique` is a partial unique index on
`(agentId, permissionId, action, vendor, amount, argumentFingerprint, status)` where
`status = 'pending' AND kind = 'agent_action'`. Postgres Phase B′ recreates
`approval_requests_agent_action_pending_uq` as:

- `UNIQUE NULLS NOT DISTINCT (agent_id, permission_id, action, vendor, amount, argument_fingerprint) WHERE status = 'pending' AND kind = 'agent_action'`

(`status` is omitted from the key because the partial predicate already fixes it to
`pending` — uniqueness among pending rows is identical.)

then `INSERT … ON CONFLICT … DO NOTHING RETURNING` + fallback select. Grant consumption
(`pending→used`) stays a single conditional `UPDATE … WHERE status='approved' AND grant_expires_at > now()`.

**Note:** The managed-profile-pause pending unique index shipped in `0000`
(`approval_requests_managed_profile_pause_pending_uq`) was *stricter* than Mongo, which only
maintains a non-unique compound lookup index and dedupes pending pause approvals via an atomic
upsert. Migration `0004_managed_profile_pause_index_parity` drops that unique index and relies on
the non-unique `approval_requests_pause_pending_lookup_idx` (added in `0003`), restoring Mongo
parity so multiple pending pause rows with an identical tuple can coexist.

### 6.10 `verification_logs`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `logId` | `log_id` | `TEXT` | PK (composite `(log_id, created_at)` if partitioned — see §12) |
| `requestId` | `request_id` | `TEXT` | NOT NULL, UQ (per-partition if partitioned) |
| `accountId` | `account_id` | `TEXT` | NULL (legacy backfill), logically FK → `accounts` — **no enforced FK** on log tables (see §9) |
| `developerUserId` | `developer_user_id` | `TEXT` | NULL |
| `agentId` | `agent_id` | `TEXT` | NOT NULL (no enforced FK; agents may be deleted while logs are retained) |
| `permissionId` | `permission_id` | `TEXT` | NULL |
| `action` | `action` | `TEXT` | NOT NULL |
| `amount` | `amount` | `NUMERIC` | NULL |
| `vendor` | `vendor` | `TEXT` | NULL |
| `allowed` | `allowed` | `BOOLEAN` | NOT NULL |
| `approvalRequired` | `approval_required` | `BOOLEAN` | NOT NULL DEFAULT false |
| `reason` | `reason` | `TEXT` | NOT NULL |
| `risk` | `risk` | `TEXT` | NOT NULL, CK `IN ('low','medium','high')` |
| `metadata` | `metadata` | `JSONB` | NULL |
| `shadow` | `shadow` | `BOOLEAN` | NOT NULL DEFAULT false |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL (rows are append-only; `updated_at` kept only for fidelity) |

The `$facet` stats aggregation in `lib/verificationLogs.ts` becomes 2–3 plain SQL
statements (`count(*) FILTER (WHERE …)` covers the whole facet in one pass; the
"top denied action/vendor" arms are `GROUP BY … ORDER BY count(*) DESC LIMIT 1`).

### 6.11 `webhook_endpoints`

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `webhookId` | `webhook_id` | `TEXT` | PK |
| `accountId` | `account_id` | `TEXT` | NOT NULL, FK → `accounts` (`ON DELETE CASCADE`) |
| `developerUserId` | `developer_user_id` | `TEXT` | NULL, FK → `developer_users` |
| `url` | `url` | `TEXT` | NOT NULL |
| `secretHash` | `secret_hash` | `TEXT` | NOT NULL; repository-restricted read |
| `secretPreview` | `secret_preview` | `TEXT` | NOT NULL |
| `events[]` | `events` | `TEXT[]` | NOT NULL; worker filters by event type → `$1 = ANY(events)` (GIN index if endpoint counts grow) |
| `status` | `status` | `TEXT` | NOT NULL DEFAULT `'active'`, CK `IN ('active','disabled')` |
| `lastTriggeredAt` | `last_triggered_at` | `TIMESTAMPTZ` | NULL |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

### 6.12 `webhook_events` (queue)

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `eventId` | `event_id` | `TEXT` | PK |
| `accountId` | `account_id` | `TEXT` | NOT NULL, FK → `accounts` |
| `developerUserId` | `developer_user_id` | `TEXT` | NULL |
| `type` | `type` | `TEXT` | NOT NULL |
| `payload` | `payload` | `JSONB` | NOT NULL |
| `status` | `status` | `TEXT` | NOT NULL DEFAULT `'pending'`, CK `IN ('pending','processing','completed','failed')` |
| `attempts` | `attempts` | `INTEGER` | NOT NULL DEFAULT 0 |
| `nextAttemptAt` | `next_attempt_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` |
| `processingStartedAt` | `processing_started_at` | `TIMESTAMPTZ` | NULL |
| `deadLetter` | `dead_letter` | `BOOLEAN` | NOT NULL DEFAULT false |
| `lastError` | `last_error` | `TEXT` | NULL |
| `completedAt` | `completed_at` | `TIMESTAMPTZ` | NULL |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

Worker claim (`lib/webhookWorker.ts`) upgrades from `findOneAndUpdate` to the canonical
Postgres queue pattern:

```sql
UPDATE webhook_events SET status = 'processing', processing_started_at = now(), attempts = attempts + 1
WHERE event_id = (
  SELECT event_id FROM webhook_events
  WHERE status = 'pending' AND next_attempt_at <= now()
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

This removes the multi-worker double-claim window that the 5-minute stuck-event recovery
compensates for today (keep the recovery sweep anyway).

### 6.13 `managed_profile_policies` + `managed_profile_protected_repos`

`managed_profile_policies`:

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `policyId` | `policy_id` | `TEXT` | PK |
| `accountId` | `account_id` | `TEXT` | NOT NULL, **UQ**, FK → `accounts` (`ON DELETE CASCADE`) — one policy per account, ports the Mongo unique index; the replace-upsert becomes `INSERT … ON CONFLICT (account_id) DO UPDATE` |
| `timezone` | `timezone` | `TEXT` | NOT NULL DEFAULT `'UTC'` |
| `enabled` | `enabled` | `BOOLEAN` | NOT NULL DEFAULT false |
| `workHours` (nested) | `work_hours` | `JSONB` | NOT NULL DEFAULT `'{}'`; `{enabled, days[], start, end}` — evaluated in app code only |
| `duringHoursMode` / `outsideHoursMode` / `defaultMode` | snake_case | `TEXT` | NOT NULL, CK `IN ('unmanaged','managed','required')` |
| `toolModes` (nested) | `tool_modes` | `JSONB` | NOT NULL DEFAULT `'{}'`; sparse per-tool overrides `{claude?, codex?, cursor?}` |
| `pausePolicy` (nested) | `pause_policy` | `JSONB` | NOT NULL DEFAULT `'{}'` |
| `protectedRepos[]` | → child table | — | promoted to relational (below) |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

`managed_profile_protected_repos` (new — promoted out of the embedded array because
protected-repo **counts are a billed plan limit** (`lib/quota.ts:checkProtectedRepoLimit`)
and repos are looked up per `repo_hash` on the CLI session-policy hot path):

| Column | Type | Constraints |
|---|---|---|
| `policy_id` | `TEXT` | NOT NULL, FK → `managed_profile_policies` (`ON DELETE CASCADE`) |
| `account_id` | `TEXT` | NOT NULL, FK → `accounts` (denormalized for direct tenant queries + counting) |
| `repo_hash` | `TEXT` | NOT NULL |
| `label` | `TEXT` | NULL |
| `mode` | `TEXT` | NOT NULL DEFAULT `'required'`, CK mode enum |
| `enabled` | `BOOLEAN` | NOT NULL DEFAULT true |
| PK | | `(policy_id, repo_hash)` |

The repository keeps returning the policy in its current nested shape, so
`lib/managedProfilePolicy.ts` callers see no difference.

### 6.14 `cli_audit_logs` (a.k.a. `cli_audit_activities` — Managed Profile activity)

| Mongo field | Column | Type | Constraints / notes |
|---|---|---|---|
| `auditId` | `audit_id` | `TEXT` | PK |
| `accountId` | `account_id` | `TEXT` | NULL (no enforced FK — log table) |
| `userId` | `user_id` | `TEXT` | NULL |
| `eventType` | `event_type` | `TEXT` | NOT NULL, CK `IN ('cli_session_policy','cli_pause_grant','cli_pause_deny','cli_pause_approval_requested')` |
| `tool` / `repo` / `branch` | snake_case | `TEXT` | NULL |
| `mode` | `mode` | `TEXT` | NULL, CK mode enum |
| `granted` | `granted` | `BOOLEAN` | NULL |
| `reason` | `reason` | `TEXT` | NOT NULL |
| `metadata` | `metadata` | `JSONB` | NULL |
| timestamps | `created_at` / `updated_at` | `TIMESTAMPTZ` | NOT NULL |

### 6.15 Remaining tables (summary mapping)

Straightforward 1:1 column ports following the same conventions:

- **`device_codes`** — `code_id` PK; UQ `device_code`, UQ `user_code`; `status` CK; `user_id` FK (SET NULL); `expires_at` + `pg_cron` cleanup.
- **`permission_profiles`** — `profile_id` PK; `account_id` NOT NULL FK; `permissions` stays **JSONB** (template snapshots, applied then copied into `permissions` rows; never queried by sub-field); index `(account_id, status)`.
- **`webhook_deliveries`** — `delivery_id` PK; `account_id`, `webhook_id`, `event_id` (logical refs, no enforced FK — log table); indexes `(account_id, webhook_id, created_at DESC)`.
- **`stripe_webhook_events`** — `event_id` PK (Stripe's own `evt_…` id gives idempotency; duplicate insert → `ON CONFLICT DO NOTHING` replaces the 11000 catch).
- **`enterprise_inquiries`** — `inquiry_id` PK; `status` CK `IN ('new','reviewed')`.
- **`cli_pause_leases`** — `lease_id` PK; `account_id`/`user_id` FKs; indexes `(account_id, user_id, expires_at)` and `(device_id, expires_at)`; app-level expiry preserved.
- **`sites`** — `site_id` PK; UQ `(account_id, domain)`; FKs to accounts/users.
- **`site_access_rules`** — `rule_id` PK; FK → `sites` (CASCADE); path arrays as `TEXT[]`.
- **`site_access_logs`** — `request_id` PK (matches current unique); no enforced FKs; index `(account_id, site_id, created_at DESC)`; same retention regime as `verification_logs`.
- **`site_guard_keys`** — `key_id` PK; UQ `key_hash`; FK → `sites` (CASCADE).
- **`status_components`** — `component_id` PK; global table (no tenant column).
- **`status_incidents`** — `incident_id` PK; `component_ids TEXT[]`; `updates` as **JSONB** array (low volume, always read whole; normalize into `status_incident_updates` only if update-level queries appear).

---

## 7. Indexes and unique constraints

Beyond PKs/UQs listed in §6, port the Mongo secondary indexes as follows
(query-verified against current call sites):

| Table | Index | Serves |
|---|---|---|
| `accounts` | `(plan)` | console summary counts |
| `accounts` | UQ `(stripe_customer_id)` (partial `WHERE stripe_customer_id IS NOT NULL`) | billing webhook lookup |
| `developer_users` | UQ `(lower(email))` | login, invites |
| `developer_sessions` | UQ `(token_hash)`; `(user_id)`; `(expires_at)` | cookie auth; logout-all; cleanup job |
| `developer_api_tokens` | UQ `(token_hash)`; `(user_id)`; `(account_id)` | token auth; token list |
| `account_memberships` | UQ `(account_id, user_id)`; `(user_id)`; `(account_id, role)` | membership resolution; seat counting |
| `account_invites` | UQ `(account_id, email, status)`; `(invite_token_hash)` partial `WHERE invite_token_hash IS NOT NULL`; `(email, status)` | invite upsert; acceptance lookup; "my invites" |
| `agents` | UQ `(api_key_hash)`; `(account_id, status)`; `(developer_user_id)` | SDK auth (hot); agent lists; quota count |
| `permissions` | `(agent_id, status)`; `(account_id, agent_id, action, status)`; `(developer_user_id, status)` | verify hot path; dashboard counts |
| `approval_requests` | UQ `(request_id)`; partial-UQ pending tuples (§6.9); `(agent_id, permission_id, status, grant_expires_at)`; `(account_id, status, created_at DESC)`; `(developer_user_id, status, created_at DESC)` | grant lookup; approvals/inbox lists |
| `verification_logs` | UQ `(request_id)`; `(account_id, agent_id, created_at DESC)`; `(account_id, created_at DESC)`; `(developer_user_id, created_at DESC)` | log lists, dashboard counts, retention windows |
| `webhook_endpoints` | `(account_id, status)` | delivery fan-out, dashboard |
| `webhook_events` | `(status, next_attempt_at, created_at)` partial `WHERE status IN ('pending','processing')`; `(account_id, dead_letter, created_at DESC)` | worker claim; dead-letter console |
| `webhook_deliveries` | `(account_id, webhook_id, created_at DESC)`; `(event_id)` | delivery history |
| `managed_profile_policies` | UQ `(account_id)` | one-per-account + session-policy read |
| `managed_profile_protected_repos` | PK `(policy_id, repo_hash)`; `(account_id)` | repo-limit counting; session-policy lookup |
| `cli_pause_leases` | `(account_id, user_id, expires_at)`; `(device_id, expires_at)` | active-lease scan |
| `cli_audit_logs` | `(account_id, created_at DESC)`; `(account_id, event_type, created_at DESC)` | activity feed + filtered feed |
| `sites` | UQ `(account_id, domain)`; `(developer_user_id, created_at DESC)` | site-guard check, lists |
| `site_access_rules` | `(site_id, status)`; `(account_id, site_id, created_at DESC)` | rule fetch |
| `site_access_logs` | `(account_id, site_id, created_at DESC)`; `(developer_user_id, created_at DESC)` | log lists |
| `site_guard_keys` | UQ `(key_hash)`; `(site_id, status)`; `(account_id, created_at DESC)` | key auth, lists |
| `device_codes` | UQ `(device_code)`, UQ `(user_code)`; `(expires_at)` | device flow; cleanup job |

Notes:

- Descending `created_at` composites replace Mongo's `{ x: 1, createdAt: -1 }` sort indexes.
- Prefer **partial indexes** where Mongo used `sparse: true` (nullable Stripe/token-hash columns).
- All tenant-scoped tables lead with `account_id` in at least one index (see §11).

---

## 8. Foreign key relationships

```text
accounts ─┬─< account_memberships >── developer_users
          ├─< account_invites (invited_by, accepted_by_user_id → developer_users)
          ├─< developer_api_tokens >── developer_users
          ├─< agents ─┬─< permissions
          │           └─< approval_requests (SET NULL)
          ├─< webhook_endpoints
          ├─< webhook_events
          ├─< managed_profile_policies ──< managed_profile_protected_repos
          ├─< cli_pause_leases
          └─< sites ─┬─< site_access_rules
                     ├─< site_guard_keys
                     └─  site_access_logs (logical ref only)
developer_users ─┬─< developer_sessions (CASCADE)
                 ├─  device_codes (SET NULL)
                 └─  primary_account_id → accounts (SET NULL)
```

Policy decisions:

- **Enforced FKs on state tables; logical (unenforced) refs on log tables**
  (`verification_logs`, `cli_audit_logs`, `site_access_logs`, `webhook_deliveries`).
  Logs must survive deletion of agents/sites/users for audit purposes, must accept
  legacy rows with missing `account_id`, and FK checks add write overhead on the
  hottest insert paths. Referential quality on logs is a monitoring concern, not a
  constraint concern.
- **`ON DELETE CASCADE`** only where the child is meaningless without the parent
  (memberships, sessions, rules, keys, protected repos, permissions under an agent).
- **`ON DELETE SET NULL`** for audit-ish references (approval `agent_id`, invite
  `accepted_by_user_id`).
- Legacy nullable `account_id` on `agents`/`permissions`/`approval_requests`: complete
  the existing Mongo backfill (`lib/account.ts:backfillDefaultAccountId`) before export;
  add `NOT NULL` in a follow-up migration once verified.

---

## 9. JSONB vs relational boundaries

**Stays JSONB** (free-form, read-whole, never filtered by sub-field in any call site):

| Column | Rationale |
|---|---|
| `accounts.onboarding` | write-once survey answers |
| `verification_logs.metadata` | SDK-supplied opaque metadata (`Schema.Types.Mixed` today) |
| `cli_audit_logs.metadata` | audit extras |
| `webhook_events.payload` | delivery envelope, opaque to the DB |
| `permissions.constraints` | evaluated wholesale in `lib/verify.ts`; shape varies by template |
| `permission_profiles.permissions` | template snapshot copied into `permissions` rows when applied |
| `managed_profile_policies.work_hours` / `tool_modes` / `pause_policy` | policy config evaluated in `lib/cliSessionPolicy.ts` |
| `status_incidents.updates` | low-volume embedded timeline |

**Becomes relational** (queried, counted, joined, or limit-enforced):

| Mongo shape | Target | Rationale |
|---|---|---|
| `ManagedProfilePolicy.protectedRepos[]` | `managed_profile_protected_repos` table | plan-limit counting (`checkProtectedRepoLimit`), per-repo-hash lookup on the CLI hot path |
| All top-level scalar fields currently nested in Mixed-ish shapes | real columns | everything in §6 |

**Simple string arrays** (`TEXT[]`, not JSONB): `agents.guidelines`,
`permissions.allowed_actions/blocked_actions`, `webhook_endpoints.events`,
`site_access_rules.allowed_paths/blocked_paths`, `status_incidents.component_ids`.
`TEXT[]` supports `= ANY(...)` and GIN containment, which covers every current query.

Rule of thumb adopted: **if application code filters, counts, joins, or enforces a plan
limit on it → column/table; if it's opaque payload → JSONB.**

---

## 10. Multi-tenant isolation design

- **`account_id` is the tenant boundary.** Every tenant-scoped table carries
  `account_id TEXT` referencing `accounts`. This matches the invariant already
  established by fail-closed quota (`lib/quota.ts:missingAccountContext`) and the
  workspace-actor resolution (`lib/workspaceActor.ts`, `lib/accountContext.ts`).
  `status_components`/`status_incidents`/`stripe_webhook_events`/`enterprise_inquiries`
  are intentionally global.
- **Workspace role enforcement stays in the application layer.** Roles/authority levels
  (`lib/authority.ts`: OWNER 100 → VIEWER 10) gate mutations via
  `requireWorkspaceMutationActor` and `requiredAuthorityLevel` comparisons. Postgres
  stores the `role` column and its CHECK constraint but does not evaluate authority —
  that logic is product logic and should not fork into SQL policies during migration.
- **Indexes on `account_id`:** every tenant-scoped table gets at least one composite
  index leading with `account_id` (§7), so tenant-filtered queries never scan across
  tenants. For the log tables this is also the retention/deletion access path.
- **RLS: not now — enable later, in "deny-all belt-and-suspenders" form first.**
  - All database access today is **server-side** (Next.js route handlers, workers,
    scripts) using what will be the Supabase **service-role/direct connection, which
    bypasses RLS entirely**. Turning on RLS policies would therefore provide zero
    enforcement for our actual traffic while adding a false sense of security and a
    second, unexercised authorization model to keep in sync with `lib/authority.ts`.
  - Recommended posture at cutover: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on every
    table **with no policies**, so the `anon`/`authenticated` PostgREST roles can read
    nothing even if the Supabase URL/anon key leak into a client bundle. Server code is
    unaffected (service role bypasses RLS).
  - Real RLS policies (`account_id = auth.jwt() ->> 'account_id'`-style) only become
    meaningful **if/when we adopt Supabase Auth and client-side queries** — both
    explicitly out of scope for this migration.
- **Client-side Supabase queries are out of scope.** The dashboard talks to our own
  API routes; the SDK talks to `/api/verify`. Nothing should query Postgres from the
  browser in v1. Revisit only after (a) Supabase Auth adoption and (b) RLS policies
  exist and are tested.

---

## 11. High-volume data strategy (verification & activity logs)

Applies to `verification_logs`, `cli_audit_logs`, `site_access_logs`, and
`webhook_deliveries`. These are append-only, retention-bound, and dominate row counts.

### 11.1 Retention by plan (existing behavior, unchanged)

Retention is already plan-derived via `PLAN_ENTITLEMENTS.logRetentionDays`
(`lib/plans.ts`) and applied at **query time** with `retentionSince()` (`lib/quota.ts`):

| Plan | logRetentionDays |
|---|---|
| free | 7 |
| team | 30 |
| pro | 90 |
| business | 180 |
| enterprise | 365 (custom per contract) |

Today nothing physically deletes old Mongo log documents — retention is a read filter.
Postgres should add **physical enforcement** (a scheduled purge/archive job per §11.4)
because unbounded log tables degrade vacuum, index bloat, and backup size. Query-time
filtering stays as the correctness layer; the purge job trails the longest applicable
retention (delete rows older than the account's plan retention + a grace window, e.g.
30 days, to keep plan-upgrade edge cases safe).

### 11.2 Indexes

As in §7: `(account_id, created_at DESC)` variants, plus `(account_id, agent_id, created_at DESC)`
on `verification_logs`. All retention scans, dashboard lists, and stats queries hit these.
No GIN index on `metadata`/`payload` initially — nothing queries into them.

### 11.3 Monthly partitioning

Implemented in the initial Postgres migration: **declarative range partitioning on
`created_at` by UTC month** for `verification_logs` (the plan's monthly-verification
quota aligns naturally with calendar months, see `verificationPeriodStart()` in
`lib/plans.ts`).

- Retention becomes `DROP TABLE verification_logs_2026_01` — instant, no vacuum churn —
  instead of `DELETE` storms.
- Partition key requires `created_at` in the PK/unique constraints:
  PK `(log_id, created_at)`, UQ `(request_id, created_at)`. The global-uniqueness
  guarantee for `request_id` is preserved in practice because IDs are random
  (`createPublicId`) and inserted exactly once; the repository treats `request_id`
  lookups as unique.
- `behalf_ensure_verification_log_partitions` pre-creates the current/future monthly
  partitions; the guarded scheduler installs a daily `pg_cron` job when the extension is
  enabled.
- A default partition is retained only as an ingestion fail-safe for out-of-window
  timestamps.
- `cli_audit_logs` / `site_access_logs` / `webhook_deliveries` remain unpartitioned and
  can adopt the same layout when they grow.

### 11.4 Archive/delete strategy

1. The implemented nightly `pg_cron` job computes each row's cutoff from the account plan
   and adds a 30-day grace window.
2. `behalf_purge_verification_logs` deletes in bounded batches, including mixed-plan
   partitions; missing/deleted accounts receive the longest retention.
3. `behalf_drop_expired_verification_log_partitions` drops only empty monthly partitions
   wholly older than 365 days plus grace. Archive/export before drop remains an operator
   requirement when long-term audit storage is enabled.
4. Advanced audit exports (`advancedAuditExportsEnabled` on business/enterprise plans)
   read from the archive, keeping the hot tables small.

### 11.5 Migration order for logs — migrate last

Logs migrate **last** (PR F in §12), after all state tables are live on Postgres:

- They are the largest datasets → longest copy times; delaying them shrinks every
  earlier rehearsal.
- They are append-only with no invariants pointing **from** state tables **to** logs,
  so nothing upstream blocks on them.
- Retention means most historical rows expire on their own: for free/team/pro accounts,
  a 90-day dual-write window makes backfill largely unnecessary — write new logs to
  Postgres, read-merge from both stores during the window, then import only the still-
  retained tail (mainly business/enterprise) and stop reading Mongo.
- Partitioning/retention design (§11.3–11.4) should be settled before their cutover so
  they are created in final form.

---

## 12. Migration risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Quota counter divergence during cutover** — `verification_count` is money-adjacent; a missed `$inc` under/over-bills | High | Cut `accounts` over inside a maintenance window at a month boundary (counter resets monthly via `verificationPeriodStart`); reconcile counts against `verification_logs` before enabling writes |
| 2 | **Approval-grant races change behavior** — Mongo upsert has no unique index; Postgres partial-unique makes dedupe stricter | Medium (behavior *improves*, but tests asserting duplicate tolerance may break) | Add the partial unique indexes with `NULLS NOT DISTINCT`; integration-test concurrent verify calls |
| 3 | **TTL loss** — sessions/device codes no longer auto-expire | Medium (unbounded growth; auth already checks expiry) | `pg_cron` cleanup jobs ship in the same migration as the tables |
| 4 | **Legacy null `account_id`** rows (agents/permissions/logs predating accounts) violate NOT NULL/FK assumptions | Medium | Run `backfillDefaultAccountId` to completion pre-export; import with nullable columns; tighten constraints post-verification |
| 5 | **Duplicate data that Mongo tolerated** (e.g. duplicate `stripe_customer_id`, un-normalized emails) fails new unique constraints at import | Medium | Pre-flight data-quality report in the export tooling; fix in Mongo before cutover |
| 6 | **Connection exhaustion in serverless** — each warm lambda holds Postgres connections; Mongo pooling hid this | High | Use Supabase pooler (transaction mode) via a single cached client (same `globalThis` pattern as `lib/db.ts`); no session-scoped features (no `SET`, temp tables) in app queries |
| 7 | **Dual-write drift** during per-table transition windows | Medium | Prefer short read-switch windows over long dual-write; where dual-write is used (logs), add row-count/checksum reconciliation jobs |
| 8 | **Mongoose document semantics leak** — call sites relying on `.save()`, mutation-in-place, or `_id` | Medium | The repository layer (PR A) flushes these out *before* any Postgres code exists; repositories return plain objects only |
| 9 | **Webhook queue double-delivery** during worker cutover — two stores both holding pending events | Medium | Drain the Mongo queue (dead-letter or complete all events) before flipping the enqueue side; worker reads exactly one store at a time |
| 10 | **Hot-path latency regression** on `/api/verify` (6–9 queries/request) | Medium | Benchmark in PR D; co-locate DB region with Vercel functions; batch the permission+approval reads into fewer round trips when porting |
| 11 | **`Infinity` entitlements** — `plan` limits use `Infinity` in JS; naive numeric columns can't store it | Low | Entitlements stay in code (`lib/plans.ts`), not in the DB — no schema impact; noted so nobody "normalizes" entitlements into a table mid-migration |
| 12 | **Rollback complexity after partial cutover** — some tables on Postgres, some on Mongo | High | Per-table repository flags make each table individually revertible; never cut over interdependent tables (e.g. `accounts` + `account_memberships`) in separate deploys |

---

## 13. Recommended migration sequence

Each PR is independently shippable and reversible. **No PR changes auth.**

### PR A — Repository/data-access interfaces over existing Mongo ✅ *shipped (Phase A)*

- **Done:** `lib/repositories/` typed interfaces per aggregate with Mongoose-backed
  implementations; all application runtime persistence routes through repositories.
- **Done:** `lib/repositories/composition.ts` — single composition point (`getRepositories()`);
  default resolves to Mongo via `resolveRepositoryBackend()` in `lib/repositories/backend.ts`.
  Postgres runtime requires **both** `BEHALFID_REPOSITORY_BACKEND=postgres` (or a per-aggregate
  `BEHALFID_REPO_BACKEND_<AGGREGATE>=postgres`) **and** the safety latch
  `BEHALFID_ALLOW_POSTGRES_RUNTIME=true`. Without the latch, postgres selection throws.
  `DATABASE_URL` alone does not switch runtime traffic. `MONGODB_URI` remains required for
  production Mongo. Use `listRepositoryBackendOverrides()` for diagnostics.
- **Done:** Direct `@/models/*` imports removed from `app/**` and `lib/*` (except repository
  implementations, `lib/db.ts`, health/diagnostics, scripts, and tests).
- **Done:** Repository contract tests for accounts, agents, memberships, managed profiles,
  approvals (fingerprint dedupe + grant consumption), and sessions (expiry + sliding activity).
- **Partial:** Runtime Postgres wiring exists behind the latch (`lib/repositories/postgres/runtime.ts`)
  for all composition aggregates. Selecting postgres still requires a DATABASE_URL/POSTGRES_URL.
  Individual methods not yet ported throw “not implemented on postgres” (no silent Mongo fallback).
  Tracked in [#144](https://github.com/BehalfID/behalf/issues/144).
- **Intentional remaining direct Mongo usage (Phase A):**
  - `lib/repositories/**` — Mongo repository implementations only
  - `lib/db.ts` — `connectToDatabase` / mongoose connection cache (`MONGODB_URI`)
  - `app/api/health/db/route.ts`, `app/api/console/settings/route.ts` — `mongoose.connection.readyState` diagnostics
  - `scripts/**` — export/backfill/seed/maintenance
  - `test/**` — fixtures, integration seeds, contract harnesses
  - `models/*.ts` — schema definitions consumed only by repositories and tests
- See also `docs/POSTGRES_SCHEMA.md` for schema notes.

**Pre-cutover follow-ups (from Phase A / B′):**

1. **Managed-profile-pause uniqueness:** Resolve or formally accept the stricter Postgres
   partial-unique constraint for pending pause approvals versus Mongo's application-level
   dedupe only.
2. **`last_activity_at` import fidelity:** During Mongo → Postgres data import, populate
   `developer_sessions.last_activity_at` from live Mongo `lastActivityAt` when available
   instead of retaining the schema migration's `created_at` fallback.

### PR B — Postgres schema & migrations (no runtime wiring) ✅ *shipped (core tables v1)*

- **Done (v1):** Drizzle schema (`lib/db/postgres/schema.ts`), initial SQL migration
  (`drizzle/0000_initial_behalf_schema.sql`), `drizzle.config.ts`, static schema tests
  (`test/postgres-schema.test.ts`), and `docs/POSTGRES_SCHEMA.md`.
- **Done (v1):** RLS enabled with no policies (deny-all baseline) on all core tables.
- **Done (v1):** Optional migration smoke test (`test/postgres-migration-smoke.test.ts`,
  `scripts/postgres-smoke.ts`, `npm run test:postgres-smoke`) — applies the initial SQL
  migration inside a disposable temporary schema; skipped by default; requires
  `RUN_POSTGRES_MIGRATION_SMOKE=true` and `POSTGRES_TEST_URL` (or `DATABASE_URL`).
- **Done (v1):** Test-only Postgres repository adapters for `accounts` and `agents`
  (`lib/repositories/postgres/*`), gated contract runner (`test/postgres-repository-contracts.test.ts`,
  `npm run test:postgres-repositories`). Adapters pass the same `test/repository-contracts/*`
  suites as Mongo; **not exported** from `lib/repositories/index.ts`; runtime still uses Mongo.
- **Done (v2):** Test-only Postgres repository adapters for `memberships` and pending invites
  (`lib/repositories/postgres/memberships.ts`). Same contract gate and runtime isolation as v1.
- **Done (Phase B′):** Schema parity with current Mongoose models (`drizzle/0003_schema_parity.sql`):
  - `developer_sessions.last_activity_at` (required; backfill from `created_at`)
  - Approval argument fields (`argument_kind`, `argument_fingerprint`, `argument_preview`,
    `argument_preview_truncated`, `used_at`) + pending unique index includes fingerprint
  - Remaining tables: device codes, permission profiles, webhook deliveries, Stripe ledger,
    enterprise inquiries, CLI pause leases, Site Guard (4), status page (2)
  - TTL purge helpers for sessions / device codes / oauth pending signups (+ optional
    `pg_cron` scheduler that returns false when the extension is unavailable)
  - Static tests: `test/postgres-schema-parity.test.ts`; optional live constraints:
    `test/postgres-parity-constraints.test.ts`
- **Done (0005):** Policy + collaboration integration tables (`drizzle/0005_policy_and_integrations.sql`):
  `policy_documents`, `integration_bindings`, `collaboration_message_refs` (+ enums,
  RLS deny-all baseline). Matches `models/PolicyDocument.ts` / `models/IntegrationBinding.ts`.
- **Backend selection (latch + per-table flags):** Global postgres requires
  `BEHALFID_ALLOW_POSTGRES_RUNTIME=true`. Per-aggregate overrides use
  `BEHALFID_REPO_BACKEND_<AGGREGATE>` (`mongo`|`postgres`). See §13 PR A / §14 rollback.
- **Not done yet:** CI job that applies migrations against live Postgres; enabling `pg_cron`
  in the target deployment; completing method-level parity on Postgres adapters (lazy Mongoose
  helpers and some edge APIs still throw “not implemented on postgres”).
- Connection module (`lib/db/postgres/index.ts`) exists; composition may call it only when
  the latch + backend flags select postgres.
- **Next after B′:** Close method-level adapter gaps and pass `test/repository-contracts/*`
  under Postgres before any production cutover. Default runtime remains Mongo.
- **Production cutover is still not approved** (latch must stay unset in prod until then).

### PR C — Data export/import scripts ✅ *shipped (tooling)*

- **Done:** `scripts/migration/export-mongo.ts` → NDJSON per collection with transform
  (ObjectId/`_id` dropped, dates → ISO, embedded arrays split into child-table rows).
- **Done:** `scripts/migration/import-postgres.ts` → FK-ordered bulk insert via postgres.js,
  `ON CONFLICT DO NOTHING` idempotency so re-runs are safe.
- **Done:** `scripts/migration/preflight-mongo.ts` + `scripts/migration/verify-import.ts`
  (row counts, sample checksums, `last_activity_at` fidelity checks).
- **Done:** Shared transforms in `scripts/migration/lib/transform.ts` +
  `test/migration-export-transform.test.ts`.
- **Done:** npm scripts `migration:export|preflight|import|verify`.
- **Ops remaining:** run preflight against production Mongo and rehearse
  export → import → verify on the Supabase staging project before any table flip.

### PR D — Non-production migration test

- Full rehearsal against a staging Supabase project with a production-shaped dataset:
  export, import, constraint verification.
- Wire a Postgres repository implementation for a small read-only surface behind an env
  flag in staging; run dual-read comparisons (Mongo result vs Postgres result diffing)
  on dashboard/console reads.
- Benchmark hot paths (`/api/verify`, `/api/cli/session-policy`) against staging Postgres.

### PR E — Cutover selected low-risk tables

- First wave (low write-rate, low blast radius): `enterprise_inquiries`,
  `status_components`, `status_incidents`, `stripe_webhook_events`, `device_codes`.
- Second wave (state tables, per-table flags, one at a time with reconciliation):
  `accounts` + tenancy tables, then agents/permissions/approvals, then webhook
  endpoints/queue (queue drained per risk #9), then managed-profile tables.
- Each flip: enable Postgres backend for that repository → verify → keep Mongo data
  frozen as rollback target for a defined window.

### PR F — Migrate logs/activity last

- After retention + partitioning design (§11) is implemented and settled: switch log
  writes to Postgres, dual-read window covering the longest retention, import the
  retained tail for business/enterprise, then retire Mongo log reads.
- Decommission `MONGODB_URI` only after all tables are flipped and the rollback window
  has lapsed.

---

## 14. Rollback strategy

- **Unit of rollback = one repository/table**, controlled by the repository factory's
  per-table backend flag (`BEHALFID_REPO_BACKEND_<AGGREGATE>`, env-driven) plus the global
  latch `BEHALFID_ALLOW_POSTGRES_RUNTIME`. Rolling back is a config change + redeploy, not a
  code revert.
- **State tables:** cut over with writes briefly paused per table (or during a
  maintenance window for `accounts`); keep the Mongo collection frozen (writes disabled
  by the flag) as the rollback image. Rollback = flip the flag back; rows written to
  Postgres during the window are re-exported to Mongo by a reverse-sync script (small,
  bounded deltas since windows are short).
- **Append-only logs:** dual-write during transition means either store is complete;
  rollback = read from Mongo again, no reverse sync needed.
- **Queue (`webhook_events`):** rollback requires re-draining whichever store holds
  pending events; the worker only ever polls one store, selected by the same flag.
- **Point of no return:** declared per table only after (a) reconciliation reports are
  clean for the agreed soak period and (b) Mongo snapshot/backup is taken. Until then,
  no Mongo collection is dropped.
- **Never rollback-partial an interdependent group** (tenancy tables move and roll back
  together — risk #12).

---

## 15. Test strategy

- **Existing suites keep passing at every step.** Unit tests (`vitest.config.ts`) mock
  models today; after PR A they mock repository interfaces — assertions unchanged.
  Integration tests (`vitest.integration.config.ts`, mongodb-memory-server via
  `test/integration/setup.ts`) continue to exercise the Mongo implementations until each
  table's cutover.
- **Repository contract tests (v1, shipped):** reusable specs under
  `test/repository-contracts/` define expected repository behavior independent of the
  backing database. `test/mongo-repository-contracts.test.ts` runs those contracts
  against the current Mongo repository implementations (mongodb-memory-server).
  `test/postgres-repository-contracts.test.ts` runs the same account, agent, and membership
  contracts against the test-only Postgres adapters (`lib/repositories/postgres/*`) when
  `RUN_POSTGRES_REPOSITORY_CONTRACTS=true` and a disposable Postgres URL are set.
  Any future Postgres/Drizzle repository adapter must pass the same contract suites before cutover.
  Runtime still uses Mongo; contract tests are the parity gate, not a migration step.
- **Contract tests for repositories (future Postgres):** one shared spec per repository
  interface, executed against *both* implementations (Mongo via mongodb-memory-server,
  Postgres via a disposable database — Testcontainers/`pglite`/Supabase local). This is
  the core correctness tool: same inputs, same observable outputs, including edge cases
  (duplicate-invite upsert, approval tuple dedupe with NULL vendor/amount, grant expiry,
  quota period reset, webhook claim contention). **Accounts, agents, and memberships/invites
  are done**; remaining aggregates follow the same pattern.
- **Migration-script tests (PR C):** golden-file export/transform tests; import
  idempotency (run twice, same row counts); FK-order violations fail loudly.
- **Migration smoke test (v1, shipped):** `test/postgres-migration-smoke.test.ts` applies
  `drizzle/0000_initial_behalf_schema.sql` to a disposable Postgres database inside a
  temporary schema, verifies tables/RLS/indexes/partition posture, then drops the schema.
  Gated by `RUN_POSTGRES_MIGRATION_SMOKE=true` and `POSTGRES_TEST_URL` (preferred) or
  `DATABASE_URL`; skipped by default so `npx vitest run` needs no database. See
  `docs/POSTGRES_SCHEMA.md` § Migration smoke test. Passing this test is required before
  Postgres repository adapters are trusted; runtime still uses Mongo.
- **Postgres repository contract tests (v1/v2, shipped):** `test/postgres-repository-contracts.test.ts`
  applies the v1 migration in a disposable schema, seeds data via Drizzle, runs account, agent,
  and membership repository contracts against `lib/repositories/postgres/*`, then drops the schema.
  Gated by `RUN_POSTGRES_REPOSITORY_CONTRACTS=true` and `POSTGRES_TEST_URL` (preferred) or
  `DATABASE_URL` / `POSTGRES_URL`; skipped by default (`npm run test:postgres-repositories`).
- **Concurrency tests (PR B/D):** parallel verify-with-approval upserts, parallel
  webhook worker claims (`SKIP LOCKED`), parallel invite acceptance — assert no
  duplicates and no lost updates.
- **Dual-read diffing in staging (PR D/E):** log-only comparison of Mongo vs Postgres
  responses for dashboard/console reads before each read-switch.
- **Perf gates (PR D):** `/api/verify` p95 budget within agreed regression tolerance
  vs the Mongo baseline before any hot-path table flips.
- **Static checks on every PR:** `npm run build` and `npx tsc --noEmit` (this doc-only
  PR runs them too).

---

## 16. Cutover checklist (per table / wave)

1. ☑ PR A repository boundary live for this table; call sites use the repository only.
2. ☐ Postgres schema applied in target project; constraints + indexes verified
   (`\d+`, migration smoke test green — `npm run test:postgres-smoke` against disposable DB).
3. ☐ Pre-flight data-quality report clean (no unique-constraint violations pending,
   backfills complete, e.g. `account_id` on legacy agents/permissions).
4. ☐ Export/import rehearsed on staging within the last week; row counts + checksums
   match; dual-read diff clean.
5. ☐ Perf benchmarks for affected hot paths within budget.
6. ☐ Mongo backup/snapshot taken; Supabase PITR confirmed enabled.
7. ☐ Rollback flag path tested in staging (flip to Postgres, flip back, verify reads).
8. ☐ Writes paused / maintenance window (state tables only) → final delta import →
   verification queries → flip repository flag → smoke tests
   (login, dashboard load, `/api/verify` allow+deny, approval flow, billing webhook
   replay, CLI session-policy).
9. ☐ Reconciliation job scheduled for the soak window; alerting on drift.
10. ☐ After soak: declare point of no return, archive the Mongo collection, update
    `docs/PRODUCTION.md` env documentation. (Supabase env vars are introduced only at
    this stage — none are added by this plan.)
11. ☐ Queue-specific (webhook_events): Mongo queue drained to zero pending before flip.
12. ☐ Logs-specific: partitions pre-created; `pg_cron` retention/archive jobs enabled;
    dual-read window sized to the longest plan retention.

---

## Appendix: explicitly out of scope for this plan

- Supabase Auth / GoTrue adoption (keep `DeveloperUser`/`DeveloperSession` auth).
- Client-side Supabase queries or exposing anon keys to the browser.
- Stripe integration changes (billing webhook logic ports as-is).
- Quota/entitlement semantics changes (`lib/plans.ts` stays code-defined truth).
- Managed Profiles behavior changes (policy evaluation stays in `lib/cliSessionPolicy.ts`).
- SDK behavior/protocol changes.
- Production environment variable additions (introduced per-table at cutover, §16).
