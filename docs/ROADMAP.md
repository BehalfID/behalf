# BehalfID Roadmap

## Shipped foundations (do not re-list as future work)

- Developer accounts, workspaces (`Account`), memberships, and role/authority model.
- CLI for agent/permission/verification workflows, coding-agent hooks, and advisory MCP tools (`@behalfid/cli` on npm).
- Approval lifecycle (request → approve/deny → grant) with dashboard inbox and webhook events.
- Site Guard MVP (site keys, rules, check API, docs) — install-site enforcement only.
- Google OIDC sign-in and workspace Google SSO domain enforcement (not SAML).
- Capability honesty matrix: `docs/CAPABILITY_MATRIX.md`.

## Near Term

- Persistent rate-limit analytics and alerting on top of Upstash Redis.
- Admin action audit logs, including setup-token use.
- Webhook dead-letter alerts and replay audit logs.
- Bulk replay controls for selected failed webhook events.
- Public creation controls per environment.
- Further developer-account and workspace hardening (beyond the foundations above).
- Named API keys with creation history and last-used metadata.
- Provider-native connected-agent integrations for Ollie, ChatGPT agents, Claude agents, Zapier, Make, and common custom-agent stacks.
- Log retention and export controls.
- Publish readiness for source-only packages (`@behalfid/mcp-runtime`, `@behalfid/install`, `@behalfid/mcp-audit`) — do not document as installable until npm publish exists.
- Gated Postgres cutover waves (Mongo remains the production default).

## Developer Experience

- Browser-safe SDK variant after a separate threat model.
- Deeper integration guides for common Node frameworks (adapters today are unofficial / experimental).
- Site Guard middleware/Cloudflare Worker packages beyond the MVP docs and examples.
- More detailed dashboard filters.

## Platform

- Richer multi-team / environment separation for development, staging, and production.
- API key prefixes and HMAC-peppered key hashes.
- Signed agent permission passports.
- Stronger Site Guard identity (beyond User-Agent) and privacy-preserving access-log hardening.

## Future Exploration

- SAML and non-Google IdPs.
- Agent passport signing and verification.
- Official (vendor-listed) integration templates for common agent frameworks.
- Verified agent credentials for Site Guard routes that require strong identity.
- Connected-agent import and reconciliation flows.
- Expanded policy templates for purchase, booking, messaging, and data-access actions.
