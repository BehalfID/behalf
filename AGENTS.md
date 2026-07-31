# AGENTS.md

## Cursor Cloud specific instructions

BehalfID is a single **Next.js 16 (App Router, Turbopack)** application served from the repo root (not the `apps/` directory). It exposes the developer portal (`/dashboard`), the password-protected admin console (`/console`), the public permission API (`/api/*`), and docs (`/docs`). The `packages/*` workspaces (SDK, CLI, MCP runtime, egress-proxy, etc.) are published libraries, not separately-running services. Node is pinned to 22 via `.nvmrc`.

Standard commands live in `package.json` scripts and `README.md` / `docs/TESTING.md` — use those as the source of truth (`npm run dev`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run build`). CI (`.github/workflows/ci.yml`) gates on `npx tsc --noEmit`, `npx vitest run`, and `npm run build` — it does **not** run `npm run lint`.

### Required service: MongoDB (must be started each session)
The app needs a local MongoDB. `mongod` (8.0) is installed in the image but is **not** started automatically and is not a systemd service here. Start it before running the dev server, tests that hit a real DB, or the console/dashboard flows:

```bash
sudo mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017
```

Run it in a persistent tmux session (it stays in the foreground). Confirm with `mongosh --quiet --eval 'db.runCommand({ping:1})'`.

### Required file: `.env` (gitignored)
The app reads `.env` (see `.env.example`). It is gitignored, so it is not in the repo; recreate it if missing with at least:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/behalfid
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000
BEHALFID_ADMIN_PASSWORD=devadminpassword123
BEHALFID_SETUP_TOKEN=dev-setup-token-123
BEHALFID_PUBLIC_AGENT_CREATION=true
BEHALFID_LOG_METADATA=true
```

Stripe, Upstash Redis, SMTP, Postgres/Drizzle, and Ollama are all **optional** and not needed for the core create-agent → permission → verify loop. `/api/health/db` reports `postgresConfigured:false` / `repositoryBackend:mongo` in this default setup, which is expected.

### Non-obvious gotchas
- **Bun is required** for a few CLI/binary tests and `npm run build:cli` (e.g. `test/cli-standalone-version.test.ts` throws "Bun is required on Linux" without it). Bun is installed and added to `PATH` via `~/.bashrc`.
- **Running the Vitest suite rewrites the tracked file `.behalf/context.md`** as a side effect. Discard it before committing: `git checkout -- .behalf/context.md`.
- **`next dev` / `next build` rewrite the auto-generated `next-env.d.ts`** (dev vs prod types path). Never commit that change; run `git checkout -- next-env.d.ts`.
- **Permissions cannot be granted with an agent API key.** `POST /api/permissions` returns "agent cannot grant permissions"; permissions must be created by a human via the dashboard/console (or `POST /api/console/agents/[agentId]/permissions` with a console session). Agent keys are for `POST /api/verify`.
- **Console mutation routes enforce an Origin check.** When scripting console login/mutations with curl, send `-H "Origin: http://localhost:3000"`.
- **`npm run lint` reports pre-existing errors** in committed code/tests; this is not caused by env setup and CI does not run it.
- The opt-in `npm run test:integration` starts an in-process `mongodb-memory-server` (downloads a binary on first run) and does not use your local `mongod`. One case in `test/integration/db-flows.integration.test.ts` is a pre-existing failure (its `vi.mock` of `@/lib/developerAuth` is missing the `requireVerifiedDeveloperApi` export).
