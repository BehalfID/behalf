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
- Console mutation routes reject mismatched `Origin` headers.
- Public and console routes use field whitelists for request bodies.
- Verification logs do not store API keys.
- API keys are redacted in demo output.

## Known Prototype Limitations

- `POST /api/agents` remains public for API compatibility and is only protected by the in-memory IP rate limit.
- Rate limiting is process-local. Vercel/serverless deployments do not share counters across instances and counters reset on cold start or redeploy.
- Failed authentication attempts are not stored in verification logs.
- The console uses one admin password instead of user accounts or organizations.
- There is no CSRF token system beyond SameSite cookies and Origin checks.
- Audit logs may contain sensitive action, vendor, or amount metadata. Do not send secrets or personal data in those fields.
- API key hashes are deterministic. A future version should use an HMAC pepper or key identifier plus HMAC hash.

## Production Recommendations

- Move rate limiting to Redis, Upstash, or provider-native controls.
- Add real developer accounts, organizations, and role-based access.
- Add account-scoped audit logging for failed auth and admin actions.
- Add log retention controls and export.
- Use a stronger key storage design with a secret pepper.
- Consider disabling public `POST /api/agents` in production and requiring console or provisioning auth.
