# Backup and restore

**Owner:** Ops / Engineering  
**Related findings:** SOC-24, ISO-04, A.8.13  
**Last restore drill:** _YYYY-MM-DD — fill after first drill_

> **2026-08-12:** the primary datastore migrated from MongoDB Atlas to Supabase/Postgres on
> 2026-07-31 (`docs/PRODUCTION.md`). This runbook has been rewritten for Postgres/Supabase.
> A restore drill against the new datastore has **not** been performed yet — treat RPO/RTO
> below as targets, not evidenced capability, until a drill is logged.

## Targets

| Metric | Target | Notes |
|--------|--------|-------|
| RPO | ≤ 24 hours | Depends on the Supabase project's backup tier (daily backups vs. point-in-time recovery) — **confirm which tier production runs on and record it here** |
| RTO | ≤ 4 hours | Restore to a staging/prod Supabase project + verify health |

## Supabase backup policy

1. Confirm the production Supabase project has daily backups (or point-in-time recovery, if on a tier that supports it) enabled — record the tier and retention window here once confirmed.
2. Restrict who can trigger a restore (Supabase project owner/admin roles + change ticket).
3. `DATABASE_URL` / `POSTGRES_URL` (see `docs/PRODUCTION.md`) is the only credential needed to point the app at a given Postgres instance — treat it as a production secret.

## Restore drill checklist

1. [ ] Create a ticket naming the backup/PITR timestamp to restore.
2. [ ] Restore into a **non-production** Supabase project or a temporary Postgres instance.
3. [ ] Point a staging app (or local) at the restored `DATABASE_URL` with read-only credentials where possible.
4. [ ] Verify: `GET /api/health`, `GET /api/health/db` (setup token), sample dashboard login, sample `/api/verify`.
5. [ ] Confirm `verification_logs` and `webhook_events`/`webhook_deliveries` tables are present with expected row counts.
6. [ ] Record drill date, duration, issues, and sign-off in this file.
7. [ ] Destroy the temporary restore instance if unused.

## Production restore (incident)

1. Declare severity per [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).
2. Snapshot/export the current (damaged) database if safe to do so.
3. Restore the selected backup/PITR point to a new Supabase project or in place, per the Supabase project's restore flow.
4. Update `DATABASE_URL` (or `POSTGRES_URL`) in Vercel Production; redeploy.
5. Run `/api/health/db` and the webhook worker once.
6. Communicate status via public status page + customer channel.

## Evidence

Store drill notes under private ops storage and link ticket IDs here after each quarterly drill.
