# Monitoring and alerting

**Owner:** Engineering  
**Related findings:** SOC-12, ISO-11, A.8.16

## Stack

| Signal | Tool | Config |
|--------|------|--------|
| Errors / exceptions | Sentry (`@sentry/nextjs`) | `SENTRY_DSN` (server). Optional `NEXT_PUBLIC_SENTRY_DSN` only if client capture is enabled later. |
| Liveness | `GET /api/health` | External uptime monitor (Better Stack / Checkly / Vercel) recommended |
| DB readiness | `GET /api/health/db` | Setup token or console session |
| Auth anomalies | `AuthEvent` collection | Review spikes in console / future alert rules |
| Webhook backlog | Worker summary + DLQ | Cron `/api/webhooks/process`; alert on repeated dead-letters |
| Log retention job | `/api/cron/purge-logs` | Daily cron; alert on non-200 |

## Sentry

- Initialized via `instrumentation.ts` + `sentry.server.config.ts` / `sentry.edge.config.ts`.
- `beforeSend` runs `redactSecrets` over the event JSON.
- Disabled when DSN unset (local default).

## Suggested alert rules

1. Error rate &gt; threshold for 5 minutes (Sentry).
2. `/api/health` failing from uptime provider.
3. AuthEvent failure count for `developer_login` or `console_login` &gt; N / 15 min.
4. Webhook process returns elevated `deadLetter` counts.
5. Log purge cron failure.

## Destinations

Configure Sentry issue alerts to email/Slack `#ops`. Document channel names in the private ops wiki.
