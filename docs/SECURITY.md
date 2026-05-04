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
- Developer portal accounts store scrypt password hashes, not plaintext passwords.
- Developer portal sessions are DB-backed, stored as token hashes, expire automatically, and use HTTP-only cookies.
- `/dashboard/*` and `/api/dashboard/*` require a developer session and scope resources by `developerUserId`.
- Dashboard mutation routes reject missing or mismatched `Origin` headers.
- Anonymous `POST /api/agents` is disabled unless `BEHALFID_PUBLIC_AGENT_CREATION=true`.
- Setup-token protected routes compare `BEHALFID_SETUP_TOKEN` server-side and never expose it to client JavaScript.
- `/api/health/db` requires console auth or the setup token.
- Rate limiting uses Upstash Redis when configured and otherwise falls back to memory.
- Public and console routes use field whitelists for request bodies.
- Verification logs do not store API keys.
- API keys are redacted in demo output.
- Webhook signing secrets are shown once, stored as a derived hash, and only a preview is displayed after creation.
- Webhook events are signed with HMAC-SHA256 over `timestamp.rawBody` using the stored SHA-256 derived signing key for the one-time `whsec_` secret.
- Webhook payloads do not include API keys, setup tokens, webhook secrets, or rotated API keys.
- Webhook URL validation requires `https://` in production and rejects obvious localhost/private IP destinations.
- Webhook events are persisted to an outbox before delivery and retried with a capped five-attempt backoff schedule.
- Webhook replay is console-authenticated, Origin-checked, account-scoped, and limited to failed dead-letter events.
- Connected-agent provider metadata is descriptive only. BehalfID does not collect provider credentials, and `externalAgentId` is never treated as authentication.
- Public passport links use a separate `bhf_pass_` token scoped to one agent. The passport page intentionally exposes the agent's active permission scopes so external agents can read what they are allowed to do. The token cannot create permissions, rotate keys, view audit logs, or expose API keys, webhook secrets, developer identity, account IDs, or internal DB IDs. Revoked and expired permissions are hidden from the public passport. A passport token is not an API key — treat it like a secret link.

## Known Prototype Limitations

- `POST /api/agents` can still be made public with `BEHALFID_PUBLIC_AGENT_CREATION=true`; use that only for local prototype mode or constrained demos.
- Disabled agents are denied on `/api/verify`, but can still rotate keys and manage permissions while authenticated; this is intentional for recovery/prototype administration.
- Rate limiting is process-local unless Upstash Redis is configured. Vercel/serverless memory counters are not shared and reset on cold start or redeploy.
- Failed authentication attempts are not stored in verification logs.
- The admin console still uses one admin password; the developer portal has individual accounts but no organizations yet.
- There is no CSRF token system beyond SameSite cookies and Origin checks.
- Audit logs always contain action, vendor/resource, and amount when provided, and those fields may still be sensitive. Optional `metadata` is only persisted when `BEHALFID_LOG_METADATA` is not `false`.
- Webhook delivery is at least once, not exactly once. Receivers should deduplicate by event ID.
- The webhook worker is an API route intended for Vercel cron or an external scheduler, not a dedicated queue service.
- Webhook event details expose the event payload to console admins for debugging. Event payload serializers must continue excluding API keys, setup tokens, webhook secrets, and rotated keys.
- API actions and webhook outbox writes are not wrapped in MongoDB transactions yet.
- Connected agents are manually represented today; provider-native connection state is not verified with external provider APIs.
- Manual passport testing does not automatically control third-party agents. The provider or your app must integrate the BehalfID verification API for automatic enforcement.
- Public passport pages expose active permission scopes by design, including `allowedActions`, `blockedActions`, `requiresApproval`, `resource`, and `scope`. Do not create permissions containing sensitive data that should not be visible to anyone with the passport token.
- Agent descriptions are informational. The structured permission fields (`allowedActions`, `blockedActions`) are the source of truth exposed to external agents reading the passport.
- API key hashes are deterministic. A future version should use an HMAC pepper or key identifier plus HMAC hash.

## Production Recommendations

- Keep public agent creation disabled and use console or `BEHALFID_SETUP_TOKEN` provisioning.
- Move rate limiting to Redis, Upstash, or provider-native controls.
- Add real developer accounts, organizations, and role-based access.
- Add account-scoped audit logging for failed auth and admin actions.
- Add log retention controls and export.
- Add stronger webhook queue observability, alerting, and replay audit logs.
- Use a stronger key storage design with a secret pepper.
- Consider disabling public `POST /api/agents` in production and requiring console or provisioning auth.
