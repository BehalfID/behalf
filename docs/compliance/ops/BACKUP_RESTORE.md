# Backup and restore

**Owner:** Ops / Engineering  
**Related findings:** SOC-24, ISO-04, A.8.13  
**Last restore drill:** _YYYY-MM-DD — fill after first drill_

## Targets

| Metric | Target | Notes |
|--------|--------|-------|
| RPO | ≤ 24 hours | MongoDB Atlas continuous/snapshot backup window |
| RTO | ≤ 4 hours | Restore to staging/prod Atlas cluster + verify health |

## Atlas backup policy

1. Enable Atlas continuous backup or cloud provider snapshots for the production cluster.
2. Retain daily snapshots for at least 7 days; weekly for 4 weeks (adjust per contract).
3. Restrict who can restore (Atlas project roles + change ticket).

## Restore drill checklist

1. [ ] Create a ticket naming the snapshot/PITR timestamp.
2. [ ] Restore into a **non-production** cluster or temporary cluster.
3. [ ] Point a staging app (or local) at the restored URI with read-only credentials where possible.
4. [ ] Verify: `GET /api/health`, `GET /api/health/db` (setup token), sample dashboard login, sample `/api/verify`.
5. [ ] Confirm verification log and webhook outbox collections present.
6. [ ] Record drill date, duration, issues, and sign-off in this file.
7. [ ] Destroy temporary restore cluster if unused.

## Production restore (incident)

1. Declare severity per [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).
2. Snapshot current (damaged) cluster if safe.
3. Restore selected snapshot to a new cluster or in-place per Atlas runbook.
4. Update `MONGODB_URI` in Vercel Production; redeploy.
5. Run `/api/health/db` and webhook worker once.
6. Communicate status via public status page + customer channel.

## Evidence

Store drill notes under private ops storage and link ticket IDs here after each quarterly drill.
