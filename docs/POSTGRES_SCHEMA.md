# Postgres Schema Reference (v1 + Phase B′ parity)

**Status:** Schema and migrations exist through `0003_schema_parity`. **Not wired to app runtime.**

Production still uses Mongo/Mongoose (`lib/db.ts`, `models/*`). This document describes the
Drizzle/Postgres schema from PR B / Phase B′ of the migration plan (`docs/DATABASE_MIGRATION.md`).

---

## Files

| Path | Purpose |
|---|---|
| `lib/db/postgres/schema.ts` | Drizzle table definitions (source of truth for types) |
| `lib/db/postgres/enums.ts` | CHECK constraint value sets shared with migrations |
| `lib/db/postgres/index.ts` | Cached Drizzle client (`getPostgresDb`) — **not imported by routes** |
| `drizzle.config.ts` | Drizzle Kit config (`DATABASE_URL` or `POSTGRES_URL`) |
| `drizzle/0000_initial_behalf_schema.sql` | Initial SQL migration |
| `drizzle/0001_workspace_slug.sql` | Adds `accounts.slug` + partial unique index |
| `drizzle/0002_google_sso.sql` | Google SSO fields + `oauth_pending_signups` |
| `drizzle/0003_schema_parity.sql` | Phase B′: sessions/approvals parity + remaining tables + TTL helpers |
| `test/postgres-schema.test.ts` | Static validation (no live Postgres required) |
| `test/postgres-schema-parity.test.ts` | Static Phase B′ parity checks |
| `test/postgres-parity-constraints.test.ts` | Optional live unique/FK/TTL constraint tests |
| `test/postgres-migration-smoke.test.ts` | Optional live migration smoke test (disposable DB only) |
| `test/postgres-repository-contracts.test.ts` | Optional Postgres account/agent/membership adapter contract tests |
| `scripts/postgres-smoke.ts` | CLI helper for the migration smoke test |
| `lib/repositories/postgres/accounts.ts` | Test-only Postgres account adapter (Drizzle) |
| `lib/repositories/postgres/agents.ts` | Test-only Postgres agent adapter (Drizzle) |
| `lib/repositories/postgres/memberships.ts` | Test-only Postgres membership/invite adapter (Drizzle) |

---

## Tables (full Mongo coverage)

| SQL table | Mongo model | Notes |
|---|---|---|
| `accounts` | Account | Tenant root; `acct_*` PK; optional `slug` (unique when set); `sso` JSONB |
| `developer_users` | DeveloperUser | `user_*` PK; nullable `password_hash`; `google_sub` |
| `oauth_pending_signups` | OAuthPendingSignup | Google signup staging; TTL cleanup helper |
| `developer_sessions` | DeveloperSession | `last_activity_at` required (sliding inactivity); TTL cleanup helper |
| `developer_api_tokens` | DeveloperApiToken | `tok_*` PK |
| `account_memberships` | AccountMembership | UQ `(account_id, user_id)` |
| `account_invites` | AccountInvite | UQ `(account_id, email, status)` |
| `device_codes` | DeviceCode | UQ device/user codes; TTL cleanup helper |
| `agents` | Agent | nullable `account_id` for legacy rows |
| `permissions` | Permission | `constraints` → JSONB |
| `permission_profiles` | PermissionProfile | `permissions` JSONB template snapshot |
| `approval_requests` | ApprovalRequest | Argument fingerprint fields; pending unique includes fingerprint |
| `verification_logs` | VerificationLog | High volume; partitioned; no enforced FKs |
| `webhook_endpoints` | WebhookEndpoint | |
| `webhook_events` | WebhookEvent | Queue; `payload` JSONB |
| `webhook_deliveries` | WebhookDelivery | Log table; no enforced FKs |
| `stripe_webhook_events` | StripeWebhookEvent | Stripe idempotency ledger |
| `enterprise_inquiries` | EnterpriseInquiry | |
| `managed_profile_policies` | ManagedProfilePolicy | UQ `account_id` |
| `managed_profile_protected_repos` | ManagedProfilePolicy.protectedRepos[] | Promoted child table |
| `cli_pause_leases` | CliPauseLease | App-level expiry only (no Mongo TTL) |
| `cli_audit_activities` | CliAuditLog | Managed Profile activity feed |
| `sites` | Site | UQ `(account_id, domain)` |
| `site_access_rules` | SiteAccessRule | FK → sites CASCADE |
| `site_access_logs` | SiteAccessLog | Log table; no enforced FKs |
| `site_guard_keys` | SiteGuardKey | UQ `key_hash`; FK → sites CASCADE |
| `status_components` | StatusComponent | Global |
| `status_incidents` | StatusIncident | `updates` JSONB timeline |

---

## Phase B′ field additions

### `developer_sessions.last_activity_at`

- **Mongo:** required `Date`, default `Date.now` on insert (`models/DeveloperSession.ts`).
- **Postgres:** `timestamptz NOT NULL DEFAULT now()`.
- Existing rows backfilled from `created_at` in `0003_schema_parity.sql`.
- Preserves sliding inactivity + `expires_at` refresh semantics in `lib/developerAuth.ts`
  once a repository adapter writes this column (runtime still Mongo).

### `approval_requests` argument binding

| Column | Mongo field |
|---|---|
| `argument_kind` | `argumentKind` (`command` \| `file_path`) |
| `argument_fingerprint` | `argumentFingerprint` |
| `argument_preview` | `argumentPreview` |
| `argument_preview_truncated` | `argumentPreviewTruncated` |
| `used_at` | `usedAt` |

Pending unique index (recreated in `0003`):

```sql
UNIQUE NULLS NOT DISTINCT
  (agent_id, permission_id, action, vendor, amount, argument_fingerprint)
WHERE status = 'pending' AND kind = 'agent_action'
```

Mirrors Mongo `approval_pending_tuple_unique` so distinct commands/paths cannot collide.

---

## ID strategy

- Primary keys are **prefixed TEXT** public IDs (`acct_*`, `user_*`, `agent_*`, …), not serial UUIDs.
- IDs are generated by `lib/ids.ts` (`createPublicId`) and preserved across the Mongo → Postgres port.

---

## Tenant boundary

Every tenant-scoped table includes `account_id TEXT` with at least one index leading on
`account_id` (except global tables and identity helpers). State tables use enforced foreign keys
to `accounts(account_id)`. Log/event tables (`verification_logs`, `cli_audit_activities`,
`webhook_deliveries`, `site_access_logs`) use logical references only.

---

## JSONB vs relational

**JSONB** (opaque, read-whole): `onboarding`, `sso`, `constraints`, `metadata`, `payload`,
`work_hours`, `tool_modes`, `pause_policy`, permission profile `permissions`,
status incident `updates`, audit `metadata`.

**Relational** (queried/counted): `managed_profile_protected_repos`.

**TEXT[]:** agent guidelines, permission action lists, webhook events, site path arrays,
status incident `component_ids`.

---

## Indexes & constraints

- Plan, role, status, and mode enums: `TEXT` + `CHECK (… IN (…))` (not native PG enums).
- `accounts.slug`: optional; partial unique where `slug IS NOT NULL`.
- Partial unique indexes on `approval_requests` for pending tuple dedupe (`NULLS NOT DISTINCT`),
  including `argument_fingerprint` for agent actions.
- `sites`: UQ `(account_id, domain)`; `site_guard_keys`: UQ `key_hash`;
  `device_codes`: UQ `device_code`, UQ `user_code`.
- `verification_logs`: composite PK `(log_id, created_at)` (partitioned).

---

## TTL cleanup (Mongo `expireAfterSeconds: 0`)

| Mongo collection | Column | Cleanup function |
|---|---|---|
| DeveloperSession | `expiresAt` | `behalf_purge_expired_developer_sessions` |
| DeviceCode | `expiresAt` | `behalf_purge_expired_device_codes` |
| OAuthPendingSignup | `expiresAt` | `behalf_purge_expired_oauth_pending_signups` |

Orchestrator: `behalf_run_ttl_cleanup(schema, batch_size)`.

**Application-level expiry checks remain authoritative** (auth/device/oauth code already
filters on `expires_at > now()`). TTL functions are storage hygiene only.

### Scheduling (`pg_cron`) — operator step

`pg_cron` is **not** assumed enabled. After migrations on a Supabase/Postgres project:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT public.behalf_schedule_ttl_cleanup('public');
-- also (from 0000):
SELECT public.behalf_schedule_verification_log_maintenance('public');
```

`behalf_schedule_ttl_cleanup` returns `false` when `pg_cron` is unavailable (smoke tests
assert this). Schedule is every 15 minutes when enabled.

`CliPauseLease.expiresAt` has **no** Mongo TTL — app-level expiry only; no purge function.

---

## High-volume logs

`verification_logs` remains RANGE-partitioned by UTC month (see prior v1 docs). Query-time
retention remains the correctness layer; physical purge is optional via maintenance functions.

---

## Row Level Security (RLS)

All tables have `ENABLE ROW LEVEL SECURITY` with **no policies** (deny-all for
`anon` / `authenticated`). Server-side service-role connections bypass RLS.
Real tenant RLS policies remain deferred until Supabase Auth + client queries (out of scope).

---

## Migration apply / preflight

Forward-only chain: `0000` → `0001` → `0002` → `0003`.

**Preflight before applying `0003` to a populated database:**

1. Confirm no two *pending* `agent_action` rows share the same
   `(agent_id, permission_id, action, vendor, amount)` under the *prior* unique index
   (already enforced). Adding `argument_fingerprint` only narrows uniqueness further.
2. Expect `last_activity_at` backfill from `created_at` for existing sessions.
3. No destructive transforms; additive columns/tables/indexes only.

```bash
# Generate migration from schema changes (requires DATABASE_URL)
npm run db:generate

# Apply migrations (requires DATABASE_URL)
npm run db:migrate

# Drizzle Studio (requires DATABASE_URL)
npm run db:studio
```

`npm run build` does **not** require a database connection.

Environment variables (not committed):

- `DATABASE_URL` or `POSTGRES_URL` — Postgres connection string for migration tooling only.
- `POSTGRES_TEST_URL` — preferred URL for optional live tests (disposable database).
- `RUN_POSTGRES_MIGRATION_SMOKE=true` — gate for smoke + parity constraint tests.
- `RUN_POSTGRES_REPOSITORY_CONTRACTS=true` — gate for repository contract tests.

---

## Migration smoke test (optional)

Applies `0000`–`0003` inside a disposable schema, verifies all tables, RLS, critical indexes
(including fingerprint-aware approval unique), verification-log partitions, retention helpers,
and TTL cleanup (expired session purged; current retained).

```bash
POSTGRES_TEST_URL='postgres://user:pass@localhost:5432/behalf_smoke' \
  npm run test:postgres-smoke
```

---

## Postgres repository adapters (test-only)

Test-only Drizzle adapters live under `lib/repositories/postgres/`:

| Adapter | Functions | Mongo equivalent |
|---|---|---|
| `accounts.ts` | `findAccountById`, `findAccountBySlug`, `resetVerificationPeriod`, `incrementVerificationCount` | `lib/repositories/accounts.ts` |
| `agents.ts` | `countAgentsByAccountId`, `countAgentsByScope` | `lib/repositories/agents.ts` |
| `memberships.ts` | membership/invite helpers | `lib/repositories/memberships.ts` |

**Important:**

- Adapters are **not** exported from `lib/repositories/index.ts` — app runtime still imports Mongo repositories.
- **Runtime cutover is still not approved.**

---

## Phase A runtime boundary (shipped)

Application routes and domain services must not import `@/models/*`. Persistence goes through
`lib/repositories/*` with Mongo implementations. Composition: `getRepositories()` /
`resolveRepositoryBackend()` — Postgres runtime selection throws.

### Intentional direct Mongo usage

| Location | Reason |
|---|---|
| `lib/repositories/**` | Mongo repository implementations |
| `lib/db.ts` | Connection cache (`MONGODB_URI`) |
| `app/api/health/db/route.ts`, `app/api/console/settings/route.ts` | `readyState` diagnostics |
| `scripts/**` | Export/backfill/seed/maintenance |
| `test/**` | Fixtures, integration seeds, contracts |
| `models/*.ts` | Schema definitions for repositories/tests |

### Pre-cutover follow-ups

1. During Mongo → Postgres import, populate `developer_sessions.last_activity_at` from live Mongo
   `lastActivityAt` when available (do not rely solely on the migration’s `created_at` backfill).

_Resolved:_ the stricter managed-profile-pause Postgres unique constraint is dropped by
migration `0004_managed_profile_pause_index_parity`, restoring Mongo parity (non-unique lookup
index only).

---

## Remaining work before runtime cutover

1. Postgres adapters + contract tests for remaining aggregates (permissions, approvals, logs, webhooks, auth).
2. Export/import scripts (PR C) + staging dual-read (PR D).
3. Enable `pg_cron` scheduling in the target project.
4. Per-table cutover (PR E/F) — **not approved yet**.
5. Do **not** adopt Supabase Auth / browser clients in the same effort.
