# AGENTS.md

## Cursor Cloud specific instructions

BehalfID is a single **Next.js 16 (App Router, Turbopack)** application served from the repo root (not the `apps/` directory). It exposes the developer portal (`/dashboard`), the password-protected admin console (`/console`), the public permission API (`/api/*`), and docs (`/docs`). The `packages/*` workspaces (SDK, CLI, MCP runtime, egress-proxy, etc.) are published libraries, not separately-running services. Node is pinned to 22 via `.nvmrc`.

**Supabase/Postgres is the canonical datastore** for normal application development and runtime. After the production Mongo → Postgres cutover, MongoDB is **not** required to lint, typecheck, unit-test, build, or run the app against a local database.

Standard commands live in `package.json` scripts and `README.md` / `docs/TESTING.md` — use those as the source of truth (`npm run dev`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run build`). CI (`.github/workflows/ci.yml`) gates on `npx tsc --noEmit`, `npx vitest run`, and `npm run build` — it does **not** run `npm run lint`. See also `docs/PRODUCTION.md` and `docs/CAPABILITY_MATRIX.md`.

### Required service: local / disposable Postgres (not production Supabase)

Use a **local or disposable Postgres** for day-to-day development and smoke checks. Do **not** point Cloud agent `.env` at the production Supabase project (`shtmmfdrgrforvqixlag`) unless an operator explicitly authorizes it.

Recommended local options:

1. **Docker** (preferred when available):

```bash
docker run --name behalfid-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=behalfid \
  -p 5432:5432 -d postgres:17
```

2. **Host Postgres** (when Docker is unavailable): install/start Postgres 16+ and create a `behalfid` database owned by your local role.

Apply the Drizzle SQL chain before expecting schema-backed routes to work:

```bash
# Uses DATABASE_URL / POSTGRES_URL from the environment
npm run db:migrate
# Optional disposable-schema smoke (CI uses this pattern):
# RUN_POSTGRES_MIGRATION_SMOKE=true POSTGRES_TEST_URL=… npm run test:postgres-smoke
```

Confirm connectivity with `psql "$DATABASE_URL" -c 'select 1'` (or equivalent).

**Production Supabase** remains the hosted source of truth for deployed environments. Local Postgres is a separate development database — never treat a Cloud agent DB as production.

### Required file: `.env` (gitignored)

The app reads `.env` (see `.env.example`). It is gitignored, so recreate it if missing. For normal Postgres runtime development use at least:

```env
# Canonical datastore (local/disposable Postgres — not production Supabase)
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/behalfid
# POSTGRES_URL=   # accepted alias for DATABASE_URL

# Required to select Postgres repositories (latch on defaults backend to postgres)
BEHALFID_ALLOW_POSTGRES_RUNTIME=true
BEHALFID_REPOSITORY_BACKEND=postgres

NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000
BEHALFID_ADMIN_PASSWORD=devadminpassword123
BEHALFID_SETUP_TOKEN=dev-setup-token-123
BEHALFID_PUBLIC_AGENT_CREATION=true
BEHALFID_LOG_METADATA=true
```

Notes:

- With `BEHALFID_ALLOW_POSTGRES_RUNTIME=true`, `DATABASE_URL` or `POSTGRES_URL` is required and `MONGODB_URI` is **not** required for app startup.
- Prefer also setting `BEHALFID_REPOSITORY_BACKEND=postgres` explicitly (the latch alone defaults the backend to postgres).
- Stripe, Upstash Redis, SMTP, Ollama, and GitHub OAuth are optional for the core create-agent → permission → verify loop.
- Healthy local setup: `GET /api/health` is OK; `GET /api/health/db` (with setup token / console auth) reports `postgresRuntime: true`, `database: "connected"`, and `repositoryBackend: "postgres"`.

### Legacy Mongo tooling (non-runtime)

Mongo is **retired for normal runtime**. Keep Mongo tooling only when you intentionally exercise legacy paths:

| Use | Notes |
| --- | --- |
| `npm run test:integration` | Starts in-process `mongodb-memory-server`; does **not** need a local `mongod`. Legacy Mongoose coverage only. |
| `scripts/migration/*` | Export/import/preflight helpers for historical Mongo → Postgres work. |
| `lib/repositories/mongo/*`, `models/*` | Test / latch-off adapters — not the production request path when the Postgres latch is on. |

Do **not** install or start local MongoDB as the required datastore for day-to-day development. Do **not** put `MONGODB_URI=mongodb://127.0.0.1:27017/behalfid` in the default Cloud agent `.env`.

If you must run latch-off Mongo code paths, set `MONGODB_URI` and leave `BEHALFID_ALLOW_POSTGRES_RUNTIME` unset — that is a legacy/test configuration, not the default.

### Health checks and dev server

```bash
npm run dev
# Liveness (no DB):
curl -sS http://localhost:3000/api/health
# DB probe (setup token as Bearer — see lib/adminAuth.ts):
curl -sS -H "Authorization: Bearer $BEHALFID_SETUP_TOKEN" http://localhost:3000/api/health/db
```

Expect Postgres-connected JSON when the latch and `DATABASE_URL` are set (`postgresRuntime: true`, `database: "connected"`, `repositoryBackend: "postgres"`). Public `/status` also probes Postgres under the latch (not Mongo).

### Non-obvious gotchas

- **Bun is required** for a few CLI/binary tests and `npm run build:cli` (e.g. `test/cli-standalone-version.test.ts` throws "Bun is required on Linux" without it). Bun is installed and added to `PATH` via `~/.bashrc` in Cloud images that include it.
- **Running the Vitest suite rewrites the tracked file `.behalf/context.md`** as a side effect. Discard it before committing: `git checkout -- .behalf/context.md`.
- **`next dev` / `next build` rewrite the auto-generated `next-env.d.ts`** (dev vs prod types path). Never commit that change; run `git checkout -- next-env.d.ts`.
- **Permissions cannot be granted with an agent API key.** `POST /api/permissions` returns "agent cannot grant permissions"; permissions must be created by a human via the dashboard/console (or `POST /api/console/agents/[agentId]/permissions` with a console session). Agent keys are for `POST /api/verify`.
- **Console mutation routes enforce an Origin check.** When scripting console login/mutations with curl, send `-H "Origin: http://localhost:3000"`.
- **`npm run lint` reports pre-existing errors** in committed code/tests; this is not caused by env setup and CI does not run it.
- Auth-satellite tables (external identities, passkeys, OAuth state, etc.) always use Postgres via `getPostgresDb()` once `DATABASE_URL` is present — keep the latch and backend flags aligned so repository facades cannot diverge.
