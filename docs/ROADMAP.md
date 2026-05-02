# BehalfID Roadmap

## Near Term

- Persistent rate-limit analytics and alerting on top of Upstash Redis.
- Admin action audit logs, including setup-token use.
- Webhook retry policy, exponential backoff, and dead-letter queue.
- Webhook replay from delivery logs.
- Public creation controls per environment.
- Real developer accounts and organizations.
- Named API keys with creation history and last-used metadata.
- Log retention and export controls.
- Route-level automated tests for allow/deny and disabled-agent flows.

## Developer Experience

- TypeScript SDK.
- CLI for agent creation, permission creation, and verification.
- Webhooks for high-risk denials and key rotation.
- More detailed dashboard filters.

## Platform

- Organization/team model.
- Environment separation for development, staging, and production.
- API key prefixes and HMAC-peppered key hashes.
- Signed agent permission passports.

## Future Exploration

- OAuth/OIDC integrations.
- Agent passport signing and verification.
- Integration templates for common agent frameworks.
- Policy templates for purchase, booking, messaging, and data-access actions.
