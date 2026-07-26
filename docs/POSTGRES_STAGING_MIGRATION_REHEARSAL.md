# Postgres staging migration rehearsal plan

**PREPARE ONLY — do not execute against any real Mongo or Postgres project as part of this
document.** This is a written rehearsal plan for the export → import → verify → dual-read →
cutover → rollback sequence described in `docs/DATABASE_MIGRATION.md` §13 (PR D). Running any
step below requires separate, explicit authorization and a disposable/staging environment.
**No production cutover happens under this plan.**

See also `docs/POSTGRES_SCHEMA.md`, `docs/POSTGRES_PG_CRON.md`, and
`docs/DATABASE_MIGRATION.md`.

## 1. Preconditions

Before running any rehearsal step:

- [ ] `BEHALFID_ALLOW_POSTGRES_RUNTIME` is **unset** (or `false`) in every environment except
      the disposable staging target used for this rehearsal. The safety latch must stay off in
      production and in the primary dev/CI environments (`lib/repositories/backend.ts`).
- [ ] The target Postgres project is a **staging-only** Supabase/Postgres project, never the
      production project. Confirm the connection string's host/project ref before running any
      script that writes data.
- [ ] The source Mongo connection used for export is a **read replica or a fresh snapshot
      restore**, not the live production primary, to avoid any load impact from export queries
      (`preflight-mongo.ts` runs `aggregate` pipelines that scan whole collections).
- [ ] A Mongo backup/snapshot exists and is confirmed restorable (point-in-time or mongodump)
      dated at or after the export run, so the rehearsal never risks the only copy of data.
- [ ] Supabase Point-in-Time Recovery (PITR) is confirmed enabled on the staging project (good
      practice even for a disposable target, so a bad import can be undone without a full
      re-import).
- [ ] The staging Postgres project has migrations `0000`–`0006` applied and passing
      `npm run test:postgres-smoke` (`RUN_POSTGRES_MIGRATION_SMOKE=true`) before any import.
- [ ] `npm run test:postgres-repositories` (`RUN_POSTGRES_REPOSITORY_CONTRACTS=true`) and
      `test/postgres-repository-parity.test.ts` are green against the current branch before
      relying on any Postgres repository adapter during the rehearsal.
- [ ] Nobody sets `BEHALFID_REPOSITORY_BACKEND=postgres` (or a per-aggregate
      `BEHALFID_REPO_BACKEND_<AGGREGATE>=postgres`) on any environment that serves real traffic
      as part of this rehearsal.

## 2. Export from Mongo

Read-only against the source. Run from a machine with access to the read replica / snapshot:

```bash
MONGODB_URI='mongodb://<staging-source>' npm run migration:preflight
```

`migration:preflight` (`scripts/migration/preflight-mongo.ts`) reports data-quality issues that
would violate Postgres constraints — duplicate `stripe_customer_id`, duplicate emails
(case-insensitive), missing `account_id` on legacy `agents`/`permissions` rows, approval
pending-tuple uniqueness collisions, duplicate slugs/`google_sub`/`api_key_hash`. **Any
`blocking` severity issue must be resolved in Mongo (or explicitly waived with a documented
reason) before proceeding to export/import.** Exit code `1` signals a blocking issue.

```bash
MONGODB_URI='mongodb://<staging-source>' npm run migration:export -- --out ./migration-data
```

`migration:export` (`scripts/migration/export-mongo.ts`) writes one NDJSON file per table under
`./migration-data/`, in `EXPORT_TABLE_ORDER`. Transforms applied: `_id`/`__v` dropped, Dates →
ISO strings, ObjectIds → strings, camelCase → snake_case, `ManagedProfilePolicy.protectedRepos[]`
split into `managed_profile_protected_repos` rows, `CliAuditLog` → `cli_audit_activities.ndjson`.
`PolicyDocument`, `IntegrationBinding`, and `CollaborationMessageRef` export even though they
predate this Phase 4 pass (added with `0005`).

`./migration-data/` is local, disposable output — treat it as containing production-shaped PII
(emails, IPs in logs, etc.) and delete it after the rehearsal completes.

## 3. Import to staging Postgres

```bash
DATABASE_URL='postgres://<staging-target>' npm run migration:import -- --in ./migration-data
```

`migration:import` (`scripts/migration/import-postgres.ts`) performs FK-ordered bulk `INSERT`
via `postgres.js` with `ON CONFLICT DO NOTHING`, so **re-running the same import is idempotent**
— safe to retry after a partial failure without truncating tables first. Import order (see the
script header): `accounts` → `developer_users` → `oauth_pending_signups` →
`developer_sessions` → `developer_api_tokens` → `account_memberships` → `account_invites` →
`device_codes` → `agents` → `permissions` → `permission_profiles` → `approval_requests` →
`webhook_endpoints` → `webhook_events` → `managed_profile_policies` →
`managed_profile_protected_repos` → `cli_pause_leases` → `sites` → `site_access_rules` →
`site_guard_keys` → `stripe_webhook_events` → `enterprise_inquiries` → `status_components` →
`status_incidents` → `verification_logs` → `webhook_deliveries` → `cli_audit_activities` →
`site_access_logs` → `policy_documents` → `integration_bindings` →
`collaboration_message_refs`.

Batch size is 200 rows per statement (`BATCH_SIZE` in the script) — appropriate for a rehearsal;
re-evaluate for a full production-sized dataset (see §8 Cutover plan, which is explicitly not
executed here).

## 4. Verification

```bash
MONGODB_URI='mongodb://<staging-source>' DATABASE_URL='postgres://<staging-target>' \
  npm run migration:verify
```

`migration:verify` (`scripts/migration/verify-import.ts`) checks, per table:

- **Row counts** — Mongo collection count vs Postgres table count, exact match required.
- **Sample checksums** — up to `SAMPLE_LIMIT` (50) rows per table, deterministic field-order
  checksum comparison between the Mongo source document and the imported Postgres row.
- **`developer_sessions.last_activity_at` fidelity** — specifically verifies that sessions with
  a live Mongo `lastActivityAt` were imported using that value rather than falling back to
  `created_at` (the migration's documented fallback for legacy rows — see
  `docs/DATABASE_MIGRATION.md` § pre-cutover follow-ups).

Exit code `1` on any mismatch — a rehearsal is not considered clean until this exits `0`.

## 5. Data reconciliation checklist

Beyond the automated `migration:verify` checks, manually confirm before treating the rehearsal
as passed:

- [ ] Row counts from `migration:verify` match for every table, including zero-row tables
      (confirms the table wasn't silently skipped).
- [ ] Sample checksum mismatches, if any, are triaged individually (a mismatch usually means a
      transform bug in `scripts/migration/lib/transform.ts`, not real data loss — but must be
      explained, not waived).
- [ ] `permissions.status = 'inactive'` rows (Phase 4 replacement staging) either don't exist
      in the source snapshot yet, or import with `replaces_permission_id` /
      `replacement_idempotency_key` populated exactly as in Mongo — spot-check a sample if any
      exist.
- [ ] Legacy null `account_id` rows on `agents` / `permissions` — confirm the Mongo backfill
      (`lib/account.ts:backfillDefaultAccountId`) ran to completion on the source before export;
      if not, expect (and document) nullable rows in the import rather than treating them as a
      bug.
- [ ] Approval pending-tuple uniqueness — confirm `migration:preflight` reported zero blocking
      collisions for the `approval_requests` partial unique index (`argument_fingerprint`
      included) before the import ran.
- [ ] `test/postgres-repository-parity.test.ts` and the full `test/repository-contracts/*` suite
      pass against the *imported* staging data using the Postgres adapters (not just against a
      freshly-seeded disposable schema) — this is the one check that exercises real
      production-shaped rows through the Phase 4 repository layer.
- [ ] No script in this rehearsal ever set a production environment variable, wrote to the
      production Mongo connection, or wrote to the production Postgres project.

## 6. Cutover plan (per-aggregate flags) — DO NOT EXECUTE

This section documents the *mechanism* only. None of it runs during this rehearsal.

Per-aggregate cutover uses `BEHALFID_REPO_BACKEND_<AGGREGATE>=postgres` overrides layered on
top of the global `BEHALFID_ALLOW_POSTGRES_RUNTIME=true` latch (`lib/repositories/backend.ts`).
The planned wave order (from `docs/DATABASE_MIGRATION.md` §13 PR E/F):

1. **First wave** (low write-rate, low blast radius): `enterprise_inquiries`,
   `status_components`, `status_incidents`, `stripe_webhook_events`, `device_codes`.
2. **Second wave** (state tables, one aggregate at a time, with reconciliation between each):
   `accounts` + tenancy tables, then `agents`/`permissions`/`approvals`, then webhook
   endpoints/queue (only after the Mongo webhook queue is fully drained), then managed-profile
   tables.
3. **Logs last** (`verification_logs`, `cli_audit_logs`, `site_access_logs`,
   `webhook_deliveries`): after retention/partitioning is settled, with a dual-read window
   sized to the account's plan log retention.

Each per-aggregate flip in a real cutover would require, at minimum: a fresh export/import/
verify cycle against the *actual* target project (not staging), a perf benchmark against the
Mongo baseline for any hot-path aggregate (`agents`, `permissions`, `apiTokens`, `sessions`),
and a defined rollback window before the next aggregate flips. **None of this is scheduled or
approved by this document.**

## 7. Rollback plan

- **Unit of rollback = one repository/aggregate**, controlled by
  `BEHALFID_REPO_BACKEND_<AGGREGATE>` plus the global latch. Rollback is a config change +
  redeploy, not a code revert (`docs/DATABASE_MIGRATION.md` §14).
- **State tables:** the Mongo collection stays frozen (writes disabled by the flag) as the
  rollback image for the duration of any real cutover window. Rolling back = flip the flag
  back to `mongo`; any rows written to Postgres during the flipped window would need a bounded
  reverse-sync back to Mongo (`scripts/migration/reverse-sync.ts`, `npm run
  migration:reverse-sync`) before Postgres is trusted as the write target again.
- **Append-only logs:** a real cutover would dual-write during the transition window, so either
  store is complete and rollback is just "read from Mongo again" — no reverse sync needed.
- **Queue (`webhook_events`):** rollback requires re-draining whichever store holds pending
  events; the worker only ever polls one store, selected by the same flag.
- **Point of no return** is declared per aggregate only after reconciliation reports are clean
  for an agreed soak period *and* a Mongo snapshot/backup is taken — not before, and not as part
  of this rehearsal.
- In this rehearsal specifically, "rollback" just means: drop the staging Postgres schema (or
  the whole staging project) and delete `./migration-data/`. Nothing durable is created outside
  the disposable staging target.

## 8. Explicit: no production cutover in Phase 4

Phase 4 delivers **repository parity** (named Postgres helpers for `users`, `sessions`,
`apiTokens`, `oauthPending`, `deviceCodes`, `accounts`, `agents`, `permissions`; a static parity
gate; contract tests) plus this rehearsal *plan*. It does **not**:

- Enable `pg_cron` anywhere (`docs/POSTGRES_PG_CRON.md`).
- Set `BEHALFID_ALLOW_POSTGRES_RUNTIME=true` in any shared environment.
- Run the export/import/verify sequence above against production Mongo or a production
  Postgres project.
- Flip any `BEHALFID_REPO_BACKEND_<AGGREGATE>` override in production.
- Change the default runtime, which **remains Mongo/Mongoose**.

Running the rehearsal steps in §2–§5 against an actual disposable staging project is a
separate, explicitly authorized follow-up — not part of accepting this document.
