# Business continuity / disaster recovery

**Owner:** Ops / Engineering  
**Related findings:** SOC-25, ISO-04, A.5.29–A.5.30

## Critical dependencies

| Dependency | Failure mode | Mitigation |
|------------|--------------|------------|
| Vercel | Deploy/region outage | Status page; wait/re-deploy; DNS remains on provider |
| Supabase (Postgres) | Instance/region unavailable | Restore per [BACKUP_RESTORE.md](./BACKUP_RESTORE.md); RTO/RPO targets |
| Upstash Redis | Rate limit shared store down | Process falls back to memory; alert and restore Redis; consider fail-closed if abuse |
| Stripe | Billing webhooks delayed | Idempotent handlers; reconcile later |
| Cron (`/api/webhooks/process`, `/api/cron/purge-logs`) | Missed schedules | Manual invoke with setup token; check DLQ |

## Communication

- Update public status components/incidents in console.
- Notify `security@behalfid.com` / on-call for Sev-1/2.
- Customer email for confirmed data-loss or multi-hour auth outages.

## Failover order (Sev-1 platform down)

1. Confirm blast radius (auth, verify, dashboard, webhooks).
2. Check Vercel + Supabase status pages.
3. If data corruption suspected → isolate writes; begin restore drill path.
4. If app-only → rollback last known-good Vercel deployment.
5. Post incident review within 5 business days.
