# `pg_cron` decision: TTL hygiene scheduling

Decision document for whether/when `pg_cron` needs to be enabled on the target Postgres
project. See also `docs/POSTGRES_SCHEMA.md` § TTL cleanup and § Scheduling (`pg_cron`), and
`docs/DATABASE_MIGRATION.md` for the overall migration plan.

## TL;DR

- **Required for production Postgres cutover** — needed for TTL storage hygiene on
  `developer_sessions`, `device_codes`, and `oauth_pending_signups`, mirroring the Mongo
  `expireAfterSeconds: 0` TTL indexes those collections rely on today.
- **NOT required for Phase 4** (repository parity) or for the staging migration rehearsal
  (`docs/POSTGRES_STAGING_MIGRATION_REHEARSAL.md`). Phase 4 is about correctness of the
  repository layer, not about running Postgres in production.
- The extension is **optional at the SQL level**: `behalf_schedule_ttl_cleanup()` returns
  `false` (not an error) when `pg_cron` is unavailable, so migrations and smoke tests never
  fail because the extension is missing.
- **Application-level expiry checks remain authoritative** regardless of `pg_cron` state.
  Auth/device/OAuth code already filters on `expires_at > now()` and fails closed on expired
  rows. `pg_cron` only prevents unbounded row growth; it never becomes a correctness
  dependency.

## Why Mongo doesn't need this and Postgres does

Mongo TTL indexes (`expireAfterSeconds: 0`) run a background job inside `mongod` that lazily
deletes documents once `expiresAt` is in the past. Postgres has no equivalent built-in
mechanism — a table with no active purge just grows forever. The three TTL-bearing Mongo
collections and their Postgres equivalents:

| Mongo collection | Postgres table | Column | Purge function |
|---|---|---|---|
| `DeveloperSession` | `developer_sessions` | `expires_at` | `behalf_purge_expired_developer_sessions(schema, batch_size)` |
| `DeviceCode` | `device_codes` | `expires_at` | `behalf_purge_expired_device_codes(schema, batch_size)` |
| `OAuthPendingSignup` | `oauth_pending_signups` | `expires_at` | `behalf_purge_expired_oauth_pending_signups(schema, batch_size)` |

All three purge functions, plus the orchestrator `behalf_run_ttl_cleanup(schema, batch_size)`
and the scheduler `behalf_schedule_ttl_cleanup(schema)`, ship in
`drizzle/0003_schema_parity.sql` and are already present in every Postgres schema created from
migration `0003` onward — including the disposable schemas used by
`test/postgres-migration-smoke.test.ts` and `test/postgres-repository-contracts.test.ts`. No
further migration is required to add `pg_cron` support; only the *scheduling* is an operator
step.

`CliPauseLease.expiresAt` has **no** Mongo TTL index and gets no Postgres purge function
either — it is app-level-expiry-only in both databases, by design (see
`docs/POSTGRES_SCHEMA.md`).

## What "optional extension" means in practice

`behalf_schedule_ttl_cleanup(target_schema)`:

1. Checks `pg_extension` for `pg_cron`. If absent, **returns `false` immediately** — no error,
   no side effect. Smoke tests assert this exact behavior on a fresh disposable schema (where
   `pg_cron` is never installed).
2. If present, unschedules any existing job with the same name and schedules
   `behalf_run_ttl_cleanup(target_schema, 1000)` to run every 15 minutes via `cron.schedule(...)`.
3. Returns `true` on success.

This means:

- Applying migrations `0000`–`0006` to a project **never** requires `pg_cron` to be installed.
- CI's `postgres-schema` job and the local `test:postgres-smoke` / `test:postgres-repositories`
  runs never install or depend on `pg_cron`.
- Phase 4's repository parity work (this migration) is entirely orthogonal to whether `pg_cron`
  is ever enabled anywhere.

## Operator enable steps (production cutover only)

Not run as part of any Phase 4 deliverable. When a project is actually promoted to serve
production Postgres traffic:

```sql
-- 1. Enable the extension (Supabase: available via the Database > Extensions UI, or SQL
--    if the connecting role has sufficient privilege).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Schedule TTL cleanup for the target schema (idempotent; safe to re-run).
SELECT public.behalf_schedule_ttl_cleanup('public');

-- 3. Also schedule verification-log partition maintenance (ships from 0000; unrelated to TTL
--    but the same operator step, same "safe to re-run" contract).
SELECT public.behalf_schedule_verification_log_maintenance('public');
```

Verify scheduling took effect:

```sql
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'behalf_%';
```

Both calls return `true`/succeed once `pg_cron` is enabled; re-running them (e.g. after a
migration bump or a schema rename) is safe — each unschedules its own prior job by name before
rescheduling.

## Until `pg_cron` is enabled

- Rows in `developer_sessions`, `device_codes`, and `oauth_pending_signups` accumulate past
  their `expires_at` timestamp. This is a storage/vacuum concern, not a security concern.
- **App-level expiry checks remain authoritative and fail-closed on expired rows** — the same
  guarantee Mongo's application code already relies on today (Mongo's TTL background job can
  itself lag by up to 60 seconds, so the app never trusted TTL for correctness either).
  Specifically:
  - Session lookups reject sessions where `expires_at <= now()`.
  - Device-code exchange rejects codes where `expires_at <= now()`.
  - OAuth pending-signup completion rejects records where `expires_at <= now()`.
- An operator can always run `SELECT public.behalf_run_ttl_cleanup('public', 1000);` manually
  (or via a one-off cron job outside Postgres, e.g. a Vercel Cron hitting an internal route) as
  a stopgap before `pg_cron` is enabled — the orchestrator function does not require the
  extension itself, only the *scheduling* wrapper does.

## Non-goals

- This document does not authorize enabling `pg_cron` anywhere. It records that the SQL-side
  work is done and optional, and defers the actual `CREATE EXTENSION` / `cron.schedule` call to
  whoever approves production cutover.
- This document does not change any TTL semantics, batch sizes, or the 15-minute schedule —
  those already shipped in `0003_schema_parity.sql` and are out of scope for Phase 4.
