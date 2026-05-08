# BehalfID Roadmap

## Near Term

- Persistent rate-limit analytics and alerting on top of Upstash Redis.
- Admin action audit logs, including setup-token use.
- Webhook dead-letter alerts and replay audit logs.
- Bulk replay controls for selected failed webhook events.
- Public creation controls per environment.
- Developer account hardening and organization support.
- Named API keys with creation history and last-used metadata.
- Provider-native connected-agent integrations for Ollie, ChatGPT agents, Claude agents, Zapier, Make, and common custom-agent stacks.
- Log retention and export controls.
- Route-level automated tests for allow/deny and disabled-agent flows.

## Developer Experience

- Browser-safe SDK variant after a separate threat model.
- CLI for agent creation, permission creation, and verification.
- Integration guides for common Node frameworks.
- BehalfID Site Guard documentation, site-key policy checks, and middleware/Cloudflare Worker templates.
- More detailed dashboard filters.

## Platform

- Organization/team model.
- Environment separation for development, staging, and production.
- API key prefixes and HMAC-peppered key hashes.
- Signed agent permission passports.
- Site Guard site/rule/log models with privacy-preserving access logs.

## Future Exploration

- OAuth/OIDC integrations.
- Agent passport signing and verification.
- Integration templates for common agent frameworks.
- Verified agent credentials for Site Guard routes that require strong identity.
- Connected-agent import and reconciliation flows.
- Policy templates for purchase, booking, messaging, and data-access actions.
