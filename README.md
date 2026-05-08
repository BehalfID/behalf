# BehalfID

BehalfID is a permission passport for AI agents. It lets developers connect the agents people already use, define what those agents are allowed to do, and verify actions before they happen.

This prototype includes the public permission API, a public docs site, a developer portal at `/dashboard`, and the existing password-protected admin console at `/console`.

## What It Does

- Add native agents and connected agents with one-time API keys.
- Store only hashed API keys.
- Create and revoke permission rules.
- Verify action, resource/service, amount, expiration, revocation, and disabled-agent state.
- Log each authenticated verification decision with a stable `requestId`.
- Rotate agent API keys.
- Manage native and connected agents, permissions, logs, key rotation, and disable/enable state in `/console`.
- Sign up for a developer portal account and manage owned resources in `/dashboard`.
- Read public integration pages at `/docs`.
- Explore the planned BehalfID Site Guard pattern for website-owner AI access enforcement.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set these values in `.env.local`:

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

## API Usage

Public API docs are available at `/docs` and in [docs/API.md](docs/API.md). Demo commands are in [docs/DEMO.md](docs/DEMO.md).

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

Local SDK source lives in `packages/sdk`. A runnable Node example lives in `examples/node-demo`.

## Site Guard Preview

BehalfID Site Guard is the planned AI access gateway for website owners. `llms.txt`-style files can declare intent, but Site Guard is designed to enforce rules when installed as middleware, a worker, proxy, or gateway before protected site workflows run.

Site Guard is not a full reverse proxy/CDN yet and does not claim reliable AI identity from User-Agent strings. See `/docs/site-guard` and [docs/SITE_GUARD.md](docs/SITE_GUARD.md) for the design.

### Reference enforcement demo

`examples/enforcement-demo` demonstrates the core enforcement pattern end-to-end using a pre-configured agent and permission:

```js
async function enforceAction(input) {
  const result = await behalf.verify({ agentId, ...input });
  if (!result.allowed) {
    throw new Error(`Action blocked by BehalfID: ${result.reason}`);
  }
  return result;
}

await enforceAction({ action: "access_data", vendor: "gmail.com" });
// Only proceeds if allowed.

await enforceAction({ action: "send_email", vendor: "gmail.com" });
// Throws — the agent never reaches the next line.
```

Denied actions fail closed. See `examples/enforcement-demo/README.md` for setup and expected output.

## Webhooks

BehalfID can send signed events for verification decisions, agent changes, and permission changes.

- Manage endpoints in `/dashboard/webhooks` or `/console/webhooks`.
- Verify signatures with `verifyWebhookSignature` from `@behalfid/sdk`.
- Process queued deliveries with setup-token protected `/api/webhooks/process`, usually from Vercel cron.
- Run the example receiver in `examples/webhook-receiver`.

Webhook delivery uses an outbox with at-least-once retries. Receivers should deduplicate by event ID.

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
3. Add `MONGODB_URI`, `BEHALFID_ADMIN_PASSWORD`, `BEHALFID_PUBLIC_AGENT_CREATION=false`, `BEHALFID_SETUP_TOKEN`, `BEHALFID_LOG_METADATA`, and optionally `NEXT_PUBLIC_APP_URL`.
4. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for shared production rate limiting.
5. Ensure MongoDB Atlas allows Vercel egress connections.
6. Deploy.

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
- Rate limiting uses Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured. Otherwise it falls back to in-memory mode.
- Optional verification `metadata` is only stored when `BEHALFID_LOG_METADATA` is not `false`; action, vendor/resource, and amount are always stored and may still be sensitive.

See [docs/SECURITY.md](docs/SECURITY.md) for the full security review and limitations, and `/security` for the public-facing security and trust page.
