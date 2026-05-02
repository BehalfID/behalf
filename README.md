# BehalfID

BehalfID is a developer-first permission passport API for AI agents. It verifies whether an agent is authorized to perform an action on behalf of a user, returns a clear allow/deny decision, and records an audit log for every verification.

## MVP Scope

- Create an agent and one-time API key.
- Store only hashed API keys.
- Create scoped permission rules for an agent.
- Verify action, amount, vendor, expiration, and revocation constraints.
- Read recent verification logs.
- Revoke permissions.
- Ship as a Vercel-ready Next.js App Router app with MongoDB and Mongoose.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `MONGODB_URI` in `.env.local` before starting the app.

Local base URL:

```txt
http://localhost:3000
```

## Environment Variables

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/behalfid
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
```

## API

See [docs/API.md](docs/API.md).

## Demo

See [docs/DEMO.md](docs/DEMO.md) for curl smoke tests.

## Deploy To Vercel

1. Push this repository to GitHub.
2. Import the project in Vercel.
3. Add `MONGODB_URI` in Vercel Project Settings.
4. Deploy.

The app is intended to run at:

```txt
https://behalfid.vercel.app
```

## Security Notes

- API keys are returned only once from `POST /api/agents`.
- Only SHA-256 hashes of API keys are stored.
- Protected routes require `Authorization: Bearer bhf_sk_xxx`.
- Agent API keys can only access their own agent, permissions, and logs.
- Request bodies are field-whitelisted to avoid mass assignment.

Known MVP limitations are documented in [docs/API.md](docs/API.md).
