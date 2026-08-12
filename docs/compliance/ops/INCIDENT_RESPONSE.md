# Incident response

**Owner:** Security / Engineering  
**Contact:** security@behalfid.com  
**Related findings:** SOC-25, ISO-03, A.5.24–A.5.28  
**Status UI:** Console → Status incidents (`/console/status`)

## Severity

| Severity | Definition | Response | Customer notify |
|----------|------------|----------|-----------------|
| Sev-1 | Full outage, confirmed breach, or data loss | Immediate | Within 1 hour of confirmation |
| Sev-2 | Major feature down (verify/auth) or suspected security event | Under 1 hour | Within 4 hours if customer-impacting |
| Sev-3 | Degraded performance, webhook backlog | Same business day | Status page optional |
| Sev-4 | Minor bug / single-tenant issue | Backlog | As needed |

## Process

1. **Detect** — Sentry alerts, health checks, AuthEvent spikes, customer report, status probe.
2. **Triage** — Assign severity; open status incident (investigating).
3. **Contain** — Rotate secrets if leaked; disable public agent creation; revoke keys; rate-limit.
4. **Eradicate / recover** — Patch, restore from backup if needed, clear DLQ with care.
5. **Communicate** — Status page transitions: investigating → identified → monitoring → fixed.
6. **Evidence** — Preserve AuthEvents, verification logs, Vercel/Supabase logs; do not wipe before counsel/security review on Sev-1 security events.
7. **Postmortem** — Root cause, timeline, CAPA; link from this doc.

## On-call

Maintain a primary/secondary engineer contact list outside this repo (password manager / ops wiki). Escalate to leadership for Sev-1.

## Evidence handling

- Prefer exports over mutating production evidence collections.
- Redact secrets with existing redaction helpers before sharing externally.
- Auth failure events retain ≤ 30 days (TTL on AuthEvent).
