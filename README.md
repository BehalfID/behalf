# BehalfID

BehalfID stops coding agents from running dangerous commands without your approval.

Wire it into Claude Code, Codex, or Cursor via the CLI/MCP path, or into any custom agent via the SDK. Once integrated, BehalfID intercepts production deploys, database migrations, git pushes to main, file deletions, billing API calls, and any other action you flag. Denied actions fail closed before they execute. Every decision is logged.

This project includes the CLI/MCP server, the JavaScript SDK, a public permission API, a developer portal at `/dashboard`, and the password-protected admin console at `/console`.

## What It Does

**Coding agent enforcement (primary use case):**
- Block production deploys, database migrations, `git push` to main, file deletions, and billing API calls.
- Require human approval before high-risk actions and let the agent retry after you approve.
- Wire into Claude Code, Codex, and Cursor via the CLI/MCP path — no code changes to the agent.

**Core platform:**
- Add native agents and connected agents with one-time API keys.
- Create and revoke permission rules with allowed actions, blocked actions, approval requirements, and amount/vendor constraints.
- Verify action, resource/service, amount, expiration, revocation, and disabled-agent state.
- Log each authenticated verification decision with a stable `requestId`.
- Rotate agent API keys, invalidating the old key immediately.
- Manage agents, permissions, logs, and key rotation in `/console`.
- Sign up for a developer portal account and manage owned resources, developer tokens, and key metadata in `/dashboard`.
- Read public integration pages at `/docs`.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Set these values in `.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/behalfid
BEHALFID_ADMIN_PASSWORD=replace-this-password
BEHALFID_PUBLIC_AGENT_CREATION=false
BEHALFID_SETUP_TOKEN=replace-this-setup-token
BEHALFID_LOG_METADATA=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For production, set `NEXT_PUBLIC_APP_URL=https://behalfid.com` in Vercel.

Then open:

```txt
http://localhost:3000/signup
http://localhost:3000/docs
```

The developer portal uses MongoDB-backed email/password accounts and HTTP-only session cookies.

## MongoDB

Use MongoDB Atlas or a local MongoDB server. For Atlas, create a database user with least-privilege access to the BehalfID database and allow the deployment environment to connect.

## Tests

The normal Vitest regression suite stays database-mocked:

```bash
npm test
```

Run the opt-in MongoDB/Mongoose integration coverage separately. It starts an isolated `mongodb-memory-server` database and does not use Atlas or production environment variables:

```bash
npm run test:integration
```

See [docs/TESTING.md](docs/TESTING.md) for covered flows and memory-server troubleshooting.

## Console Usage

1. Visit `/console/login`.
2. Enter `BEHALFID_ADMIN_PASSWORD`.
3. Add an agent and store the returned API key.
4. Open the agent detail page to create permissions, rotate the key, revoke permissions, disable/enable the agent, and inspect logs.

The console uses an HTTP-only signed cookie. The admin password is verified server-side and is not exposed to frontend JavaScript.

## Developer Portal

1. Visit `/signup`.
2. Create a developer account.
3. Open `/dashboard/agents`.
4. Add a native agent for custom integrations or a connected agent for tools like Ollie, ChatGPT, Claude, Zapier, or Make, then store the one-time API key.
5. Create permissions, verify actions with the SDK, inspect logs, and configure webhooks.

The dashboard is separate from `/console`; dashboard users only see resources with their own `developerUserId`.

API keys and developer tokens are shown only once. Store them in environment variables or a secret manager. BehalfID stores only hashes plus safe metadata such as created, last-used, and rotated timestamps.

## API Usage

Public API docs are available at `/docs` and in [docs/API.md](docs/API.md). Demo commands are in [docs/DEMO.md](docs/DEMO.md). The local coding-agent MCP workflow is in [docs/MCP_DEMO.md](docs/MCP_DEMO.md).

BehalfID has four developer adoption paths:

- **CLI/MCP path (coding agents):** wire `verify_action` into Claude Code, Codex, and Cursor with `behalf mcp init && behalf claude`. No code changes to the agent required.
- **SDK path:** call `behalf.verify()` inside your app before a tool action executes. Works with any Node.js agent or automation.
- **Action Gateway path:** call BehalfID to verify and execute a supported safe action in one request.
- **Site Guard path:** call `/api/site-guard/check` from server-side middleware before protected routes are served.

Agents can be `native` or `connected`. Native agents are BehalfID-created identities for custom integrations. Connected agents manually represent external agents people already use; provider fields are metadata and are not authentication.

## JavaScript SDK

```bash
npm install @behalfid/sdk
```

### Example

```js
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY,
  baseUrl: "https://behalfid.com"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "access_data",
  vendor: "gmail.com"
});

if (!result.allowed) {
  console.log(result.reason);
}
```

Local SDK source lives in `packages/sdk`. Runnable examples live in `examples/node-demo` and `examples/enforcement-demo`.

## CLI / MCP For Coding Agents

Use the CLI/MCP path when a local AI coding agent should inspect permissions and call `verify_action` before risky work:

```bash
behalf config set agent-id agent_xxx
behalf config set api-key bhf_sk_xxx
behalf mcp init
behalf doctor
behalf claude   # or: behalf codex
```

`behalf mcp init` creates `.behalf/context.md` and merges a BehalfID server entry into `.mcp.json`. Denied verification results, approval-required results, and unavailable verification all fail closed: the agent must not execute the action. See [docs/MCP_DEMO.md](docs/MCP_DEMO.md).

## Site Guard MVP

BehalfID Site Guard is an MVP policy check for website owners. Create sites and simple access rules under `/dashboard/sites`, then call `POST /api/site-guard/check` from server-side middleware, a worker, or a gateway before protected routes are served. The check uses an account-scoped developer token in `x-developer-token`, denies when no active rule allows the path, and logs allowed and denied decisions with a `requestId`.

Site Guard rules match either a caller-supplied `agentIdentifier` or a simple User-Agent wildcard pattern. Path allow rules use exact paths or `*` wildcards, and matching blocked paths override allows. User-Agent is only a weak signal: Site Guard is not a full reverse proxy/CDN, crawler registry, or provider-native identity system. See `/docs/site-guard`, [docs/SITE_GUARD.md](docs/SITE_GUARD.md), and `examples/site-guard-demo`.

### Reference enforcement demo

`examples/enforcement-demo` demonstrates the core enforcement pattern end-to-end using a real agent, real permissions, the SDK, Action Gateway execution, and audit-log lookup:

```ts
const decision = await behalf.verify({ agentId, ...input });

if (!decision.allowed) {
  throw new Error(`Action blocked by BehalfID: ${decision.reason}`);
}

return executeAction(decision);
```

Run it locally:

```bash
npm run dev

cd examples/enforcement-demo
npm install
cp .env.example .env
npm run setup
npm run demo
```

It covers:

```txt
allowed browse_web -> Action Gateway executor runs
purchase over maxAmount -> executor does not run
blocked send_email -> executor does not run
approval-required renewal -> executor does not run
missing deploy permission -> executor does not run
audit logs -> requestIds are present
```

Denied actions fail closed. See `examples/enforcement-demo/README.md` for setup and expected output.

## Verification Logs

Verification logs show what an agent attempted, whether the decision was allowed or denied, the risk level, the reason, the agent, the resource/vendor, the amount when supplied, and the stable `requestId`. Dashboard and console log views support filters for decision, agent, action, risk, request ID, date range, and limit/page. CSV export uses the same safe selected fields.

Use `requestId` to connect a verify response to the dashboard/console log entry, CLI output, and any verification webhook payload. Optional verification `metadata` is persisted only when `BEHALFID_LOG_METADATA` is not `false`; list and export views omit metadata today. Raw bearer tokens, API keys, developer tokens, passport tokens, and webhook signing secrets are redacted from log responses and exports.

## Webhooks

BehalfID can send signed events for verification decisions, agent changes, and permission changes.

- Manage endpoints in `/dashboard/webhooks` or `/console/webhooks`. Dashboard webhooks require Pro or Enterprise; Free accounts see a plan-gated error and disabled creation controls.
- Verify signatures with `verifyWebhookSignature` from `@behalfid/sdk`.
- Process queued deliveries with setup-token protected `/api/webhooks/process`, usually from Vercel cron.
- Run the example receiver in `examples/webhook-receiver`.

Webhook delivery uses an outbox with at-least-once retries. Receivers should deduplicate by event ID.

## Plans and Usage

The dashboard billing view shows current plan, agent usage, monthly verification usage, webhook access, log retention, and the UTC monthly reset date.

| Plan | Billable seats | Agents | Protected repos | Verifications / month | Webhooks | Log retention |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Free | 1 | 3 | 1 | 10,000 | Disabled | 7 days |
| Pro (legacy) | 25 | 50 | 10 | 250,000 | Enabled | 90 days |
| Team | 25 | 25 | 10 | 250,000 | Enabled | 30 days |
| Business | 100 | 250 | 100 | 2,000,000 | Enabled | 180 days |
| Enterprise | Unlimited | Unlimited | Unlimited | Unlimited | Enabled | 365 days (custom) |

Quota failures return stable error codes such as `AGENT_LIMIT_REACHED`, `VERIFICATION_LIMIT_REACHED`, `SEAT_LIMIT_REACHED`, `PROTECTED_REPO_LIMIT_REACHED`, and `WEBHOOKS_REQUIRE_PRO`, plus the current plan, relevant limit, and a safe upgrade hint. Creation limits block new resources only; existing resources are never deleted or disabled by entitlement enforcement. Downgrades and failed payments disable dashboard webhooks and remove paid limits until billing is restored. See [docs/ENTITLEMENTS.md](docs/ENTITLEMENTS.md).

See [docs/WEBHOOKS.md](docs/WEBHOOKS.md).

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run build:sdk
bash -n scripts/smoke-test.sh
BASE_URL=http://localhost:3000 scripts/smoke-test.sh
BEHALFID_SETUP_TOKEN=replace-this-setup-token BASE_URL=http://localhost:3000 scripts/smoke-test.sh
```

The smoke test requires `jq`, a running app, and a valid MongoDB connection. If `BEHALFID_PUBLIC_AGENT_CREATION=false`, pass `BEHALFID_SETUP_TOKEN` to the smoke script.

## Controlled Agent Creation

`POST /api/agents` is closed to anonymous public requests by default. For local prototype mode, set:

```env
BEHALFID_PUBLIC_AGENT_CREATION=true
```

For safer public deployments, keep it false and create agents through the console or with:

```txt
Authorization: Bearer <BEHALFID_SETUP_TOKEN>
```

Never expose `BEHALFID_SETUP_TOKEN` to frontend JavaScript.

## Health Checks

- `GET /api/health` is public and returns app status, timestamp, and environment.
- `GET /api/health/db` requires console auth or `BEHALFID_SETUP_TOKEN` and returns safe database status.

## Deploy To Vercel

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Add required production env vars: `MONGODB_URI`, `BEHALFID_ADMIN_PASSWORD`, `BEHALFID_SETUP_TOKEN`, `NEXT_PUBLIC_APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRO_PRICE_ID`.
4. Keep `BEHALFID_PUBLIC_AGENT_CREATION=false` unless intentionally running an open demo.
5. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for shared production rate limiting.
6. Ensure MongoDB Atlas allows Vercel egress connections.
7. Configure Stripe to send billing webhooks to `/api/billing/webhook`.
8. Configure a protected cron or scheduler for `/api/webhooks/process`.
9. Deploy.

See [docs/PRODUCTION.md](docs/PRODUCTION.md) for the full production checklist.

Production URL target:

```txt
https://behalfid.com
```

Vercel preview and fallback deployment URLs may still exist, but `https://behalfid.com` is the canonical public domain.

After changing domains:

1. Update Vercel environment variables, including `NEXT_PUBLIC_APP_URL=https://behalfid.com`.
2. Redeploy the app.
3. Test generated passport links from `/dashboard/agents/[agentId]`.
4. Test SDK examples against `https://behalfid.com`.
5. Inspect Open Graph and canonical metadata for the production domain.

## Security Notes

- API keys are returned once at creation or rotation.
- Only SHA-256 hashes of API keys are stored.
- Public protected routes require `Authorization: Bearer bhf_sk_xxx`.
- Agent API keys can access only their own agent, permissions, and logs.
- Console routes require the signed admin cookie.
- Request bodies are field-whitelisted.
- Rate limiting uses Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured. Otherwise it intentionally falls back to per-process memory mode and logs a production warning once per process.
- Optional verification `metadata` is only stored when `BEHALFID_LOG_METADATA` is not `false`; action, vendor/resource, and amount are always stored and may still be sensitive.

See [docs/SECURITY.md](docs/SECURITY.md) for the full security review and limitations, and `/security` for the public-facing security and trust page.
