# Site Guard — Express Middleware Example

This example shows how to protect Express routes with **BehalfID Site Guard** before the route handler runs.

## What it does

- `GET /docs/:slug` is checked against Site Guard rules before serving.
- `GET /admin/:page` is checked against Site Guard rules before serving.
- `GET /` and `GET /health` are public — no Site Guard check.
- If the check **allows** the request → the route handler runs and responds normally.
- If the check **denies** the request → the middleware responds `403` and the handler never runs.
- If BehalfID is **unavailable** → the middleware responds `403` (**fail closed**).

Whether a path is ultimately allowed or blocked is determined by the rules you configure in the BehalfID dashboard, not by the server code itself.

## Files

| File | Purpose |
|---|---|
| `src/siteGuard.ts` | `checkSiteGuardAccess()` helper + `siteGuard()` middleware factory |
| `src/server.ts` | Express server with guarded and public routes |
| `.env.example` | Environment variable template |
| `tsconfig.json` | TypeScript configuration |

## Quick start

### 1. Create a site key

1. Open the [BehalfID dashboard](https://behalfid.com/dashboard/sites).
2. Create or open a site.
3. Click **Site keys → Create site key**.
4. Copy the raw key immediately — it is shown only once.

### 2. Install and configure

```bash
cd examples/site-guard-express
npm install
cp .env.example .env
# Edit .env and set SITE_GUARD_KEY=bhf_site_xxx
```

### 3. Run the server

```bash
# Development (TypeScript, auto-reload):
npm run dev

# Production (compile then run):
npm run build && npm start
```

The server listens on `http://localhost:3001` by default.

### 4. Configure Site Guard rules in the dashboard

Add rules for your site that allow or block specific paths. For example:

```
User-Agent pattern:  *Bot*
Allowed paths:       /docs/*
Blocked paths:       /admin/*
```

A path is **denied by default** unless an active matching rule explicitly allows it.

## Using the middleware in your own Express app

```ts
import { siteGuard } from "./siteGuard.js";

// Protect a single route:
app.get("/docs/:slug", siteGuard(), docsHandler);

// Protect a router:
const docsRouter = express.Router();
docsRouter.use(siteGuard());
docsRouter.get("/:slug", docsHandler);
app.use("/docs", docsRouter);
```

## Key behaviors

| Scenario | Result |
|---|---|
| Site Guard allows the path | `next()` is called — route handler runs |
| Site Guard denies the path | `403 Access denied by Site Guard.` |
| `SITE_GUARD_KEY` is not set | `403` (fail closed) |
| BehalfID returns a non-2xx | `403` (fail closed) |
| Network error / timeout | `403` (fail closed) |

## Security rules

- **`SITE_GUARD_KEY` is server-side only.** The key must never appear in an API response, a log line visible to clients, or any client-accessible file.
- **No `siteId` in the body.** Site keys are scoped to one site — the key itself encodes the site. Do not add `siteId` or `domain` to the request body.
- **Fail closed.** Any error or missing configuration produces a `403`, never an accidental allow.
- **`blockedPaths` override `allowedPaths`.** A blocked path can never be allowed, even by another active rule.

## Test with curl

```bash
# Start the server:
npm run dev

# Test the underlying Site Guard API directly:

# Allowed request:
curl https://behalfid.com/api/site-guard/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SITE_GUARD_KEY" \
  -d '{"path": "/docs/getting-started", "userAgent": "ExampleBot/1.0"}'

# Denied request:
curl https://behalfid.com/api/site-guard/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SITE_GUARD_KEY" \
  -d '{"path": "/admin/settings", "userAgent": "ExampleBot/1.0"}'

# Test the Express server (with SITE_GUARD_KEY set):
curl http://localhost:3001/docs/api -H "User-Agent: ExampleBot/1.0"
curl http://localhost:3001/admin/settings -H "User-Agent: ExampleBot/1.0"
```

For local development against a local BehalfID instance, set `BEHALFID_BASE_URL=http://localhost:3000` in `.env`.

## How the helper works

```ts
// src/siteGuard.ts — simplified

const response = await fetch(`${BEHALFID_BASE_URL}/api/site-guard/check`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SITE_GUARD_KEY}`,  // site key — server-side only
  },
  body: JSON.stringify({
    path: req.path,          // e.g. "/docs/api"
    userAgent: req.headers["user-agent"],
    agentIdentifier: req.headers["behalfid-agent"],  // optional
    // no siteId — the key already encodes the site
  }),
});

if (!response.ok) {
  res.status(403).send("Site Guard check returned an error.");
  return;
}

const decision = await response.json();
if (!decision.allowed) {
  res.status(403).send(decision.reason);
  return;
}

next();  // allowed — route handler runs
```
