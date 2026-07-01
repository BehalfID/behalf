# AGENTS.md

## Cursor Cloud specific instructions

BehalfID is a single Next.js 16 (App Router, React 19, Turbopack) web app plus supporting
publishable packages under `packages/*` and runnable demos under `examples/*`. It is a runtime
permission/authorization gateway for AI agents: the core flow is create agent → create permission →
`POST /api/verify` returns an allow/deny decision. Standard commands live in `README.md` and root
`package.json` scripts; the notes below only cover non-obvious startup/run caveats.

### Services

- **MongoDB (required)** — All persistence. It is installed in the VM image and must be running
  before the app, tests that hit the DB, or the smoke test. There is no systemd in this VM, so start
  it manually (it does not auto-start):
  `mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017` (run in a tmux/background
  session). Verify with `mongosh --quiet --eval 'db.runCommand({ping:1})'`.
- **Next.js web app (required)** — `npm run dev` serves on port 3000. It auto-loads `.env`.
- Redis (Upstash), Stripe, SMTP, and Ollama are all optional and degrade gracefully when their env
  vars are unset; they are not needed for core end-to-end testing.

### Environment file

`.env` is gitignored and must exist for the app to talk to MongoDB. Minimum working config for local
dev (values are non-secret dev placeholders):

```
MONGODB_URI=mongodb://127.0.0.1:27017/behalfid
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000
BEHALFID_ADMIN_PASSWORD=devpassword-change-me
BEHALFID_SETUP_TOKEN=dev-setup-token-change-me
BEHALFID_PUBLIC_AGENT_CREATION=true
BEHALFID_LOG_METADATA=true
```

Log into the admin console at `/console/login` with `BEHALFID_ADMIN_PASSWORD`.

### Tests / lint / build

- `npm run lint`, `npm test` (unit, DB-mocked), and `npm run test:integration`
  (spins up its own `mongodb-memory-server`, no external DB needed) are the main checks.
- The root Vitest suite imports source directly from `packages/cli` and `packages/sdk`, so those
  packages need their own deps installed (`npm --prefix packages/cli install`,
  `npm --prefix packages/sdk install`) or you get `Cannot find package 'commander'` style errors.
  The update script installs these.
- Known pre-existing failures unrelated to environment setup (do not treat as regressions): the
  unit suite `test/demoScenarios.test.ts` uses scenario IDs that no longer exist in
  `lib/demoScenarios.ts`, and `test/integration/db-flows.integration.test.ts` mocks
  `@/lib/developerAuth` without re-exporting `requireVerifiedDeveloperApi`.
- `scripts/smoke-test.sh` exercises the full agent→permission→verify→revoke→rotate→logs flow against
  a running app (requires `jq` and MongoDB). Pass `BEHALFID_SETUP_TOKEN=...` when
  `BEHALFID_PUBLIC_AGENT_CREATION=false`. Its late billing-auth assertion (step 13) expects a 401
  but `/api/billing/portal` returns 403 — a pre-existing assertion drift, not a functional failure.
