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

## Scripts

```bash
npm run dev
npm run lint
npm run build
bash -n scripts/smoke-test.sh
BASE_URL=http://localhost:3000 scripts/smoke-test.sh
```

The smoke test requires `jq`, a running app, and a valid MongoDB connection.

## Deploy To Vercel

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Add `MONGODB_URI`, `BEHALFID_ADMIN_PASSWORD`, and optionally `NEXT_PUBLIC_APP_URL`.
4. Ensure MongoDB Atlas allows Vercel egress connections.
5. Deploy.

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
- Rate limiting is in-memory for the prototype. Production should use Redis, Upstash, or provider-native rate limiting because Vercel/serverless instances do not share memory.

See [docs/SECURITY.md](docs/SECURITY.md) for the full security review and limitations.
