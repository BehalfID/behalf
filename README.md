# BehalfID

BehalfID is identity and permissions for AI agents. It is a developer-first system for verifying whether an AI agent is authorized to act on behalf of a user.

This prototype includes the public permission API plus a password-protected developer console at `/console`.

## What It Does

- Create agents and one-time API keys.
- Store only hashed API keys.
- Create and revoke permission rules.
- Verify action, amount, vendor, expiration, revocation, and disabled-agent state.
- Log each authenticated verification decision with a stable `requestId`.
- Rotate agent API keys.
- Manage agents, permissions, logs, key rotation, and disable/enable state in `/console`.

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

Then open:

```txt
http://localhost:3000/console
```

## MongoDB

Use MongoDB Atlas or a local MongoDB server. For Atlas, create a database user with least-privilege access to the BehalfID database and allow the deployment environment to connect.

## Console Usage

1. Visit `/console/login`.
2. Enter `BEHALFID_ADMIN_PASSWORD`.
3. Create an agent and store the returned API key.
4. Open the agent detail page to create permissions, rotate the key, revoke permissions, disable/enable the agent, and inspect logs.

The console uses an HTTP-only signed cookie. The admin password is verified server-side and is not exposed to frontend JavaScript.

## API Usage

Public API docs are in [docs/API.md](docs/API.md). Demo commands are in [docs/DEMO.md](docs/DEMO.md).

## JavaScript SDK

```bash
npm install @behalfid/sdk
```

### Example

```js
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY,
  baseUrl: "https://behalfid.vercel.app"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "purchase",
  amount: 742,
  vendor: "coachella.com"
});

if (!result.allowed) {
  console.log(result.reason);
}
```

Local SDK source lives in `packages/sdk`. A runnable Node example lives in `examples/node-demo`.

## Webhooks

BehalfID can send signed events for verification decisions, agent changes, and permission changes.

- Manage endpoints in `/console/webhooks`.
- Verify signatures with `verifyWebhookSignature` from `@behalfid/sdk`.
- Run the example receiver in `examples/webhook-receiver`.

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
https://behalfid.vercel.app
```

## Security Notes

- API keys are returned once at creation or rotation.
- Only SHA-256 hashes of API keys are stored.
- Public protected routes require `Authorization: Bearer bhf_sk_xxx`.
- Agent API keys can access only their own agent, permissions, and logs.
- Console routes require the signed admin cookie.
- Request bodies are field-whitelisted.
- Rate limiting uses Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured. Otherwise it falls back to in-memory mode.
- Optional verification `metadata` is only stored when `BEHALFID_LOG_METADATA` is not `false`; action, vendor, and amount are always stored and may still be sensitive.

See [docs/SECURITY.md](docs/SECURITY.md) for the full security review and limitations.
