# Security Notes

BehalfID is currently a prototype. It is suitable for local demos and constrained deployments, not open public multi-tenant use.

## Implemented Controls

- Agent API keys are generated with high entropy and returned only once at creation or rotation.
- Only SHA-256 API key hashes are stored.
- Public protected routes require `Authorization: Bearer bhf_sk_xxx`.
- Agent ownership is enforced before permission creation, verification, log reads, revocation, and key rotation.
- API key hash comparisons use `crypto.timingSafeEqual`.
- Console login checks `BEHALFID_ADMIN_PASSWORD` server-side and sets an HTTP-only signed cookie.
- Console pages and `/api/console/*` routes require the console session cookie.
- Console mutation routes reject missing or mismatched `Origin` headers for configured localhost/Vercel origins.
- Anonymous `POST /api/agents` is disabled unless `BEHALFID_PUBLIC_AGENT_CREATION=true`.
- Setup-token protected routes compare `BEHALFID_SETUP_TOKEN` server-side and never expose it to client JavaScript.
- `/api/health/db` requires console auth or the setup token.
- Rate limiting uses Upstash Redis when configured and otherwise falls back to memory.
- Public and console routes use field whitelists for request bodies.
- Verification logs do not store API keys.
- API keys are redacted in demo output.
- Webhook signing secrets are shown once, stored as a derived hash, and only a preview is displayed after creation.
- Webhook events are signed with HMAC-SHA256 over `timestamp.rawBody`.
- Webhook payloads do not include API keys, setup tokens, webhook secrets, or rotated API keys.
- Webhook URL validation requires `https://` in production and rejects obvious localhost/private IP destinations.

## Known Prototype Limitations

- `POST /api/agents` can still be made public with `BEHALFID_PUBLIC_AGENT_CREATION=true`; use that only for local prototype mode or constrained demos.
- Disabled agents are denied on `/api/verify`, but can still rotate keys and manage permissions while authenticated; this is intentional for recovery/prototype administration.
- Rate limiting is process-local unless Upstash Redis is configured. Vercel/serverless memory counters are not shared and reset on cold start or redeploy.
- Failed authentication attempts are not stored in verification logs.
- The console uses one admin password instead of user accounts or organizations.
- There is no CSRF token system beyond SameSite cookies and Origin checks.
- Audit logs always contain action, vendor, and amount when provided, and those fields may still be sensitive. Optional `metadata` is only persisted when `BEHALFID_LOG_METADATA` is not `false`.
- Webhooks currently make one delivery attempt and do not retry failed deliveries.
- Webhook delivery is asynchronous best effort in this MVP and should move to a durable queue before high-volume production use.
- API key hashes are deterministic. A future version should use an HMAC pepper or key identifier plus HMAC hash.

## Production Recommendations

- Keep public agent creation disabled and use console or `BEHALFID_SETUP_TOKEN` provisioning.
- Move rate limiting to Redis, Upstash, or provider-native controls.
- Add real developer accounts, organizations, and role-based access.
- Add account-scoped audit logging for failed auth and admin actions.
- Add log retention controls and export.
- Add durable webhook queues, retry policy, and dead-letter handling.
- Use a stronger key storage design with a secret pepper.
- Consider disabling public `POST /api/agents` in production and requiring console or provisioning auth.
