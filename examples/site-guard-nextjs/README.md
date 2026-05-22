# Site Guard — Next.js Middleware Example

This example shows how to protect Next.js routes with **BehalfID Site Guard** before any page or route handler runs.

## What it does

- Requests to `/docs/*` and `/admin/*` are checked against Site Guard rules.
- If the check **allows** the request → the route handler runs normally.
- If the check **denies** the request → the middleware responds `403` and the route never runs.
- If BehalfID is **unavailable** → the middleware responds `403` (**fail closed**).
- Static assets and Next.js internals (`/_next/*`, `.js`, `.css`, `.ico` …) always bypass the check.

Whether a path is ultimately allowed or blocked is determined by the rules you configure in the BehalfID dashboard, not by the middleware code itself.

## Files

| File | Purpose |
|---|---|
| `middleware.ts` | Next.js middleware — runs before every matched request |
| `lib/site-guard.ts` | `checkSiteGuardAccess()` helper — the BehalfID API call |
| `.env.example` | Environment variable template |

## Quick start

### 1. Create a site key

1. Open the [BehalfID dashboard](https://behalfid.com/dashboard/sites).
2. Create or open a site.
3. Click **Site keys → Create site key**.
4. Copy the raw key immediately — it is shown only once.

### 2. Set environment variables

```bash
cp .env.example .env.local
# Edit .env.local and set SITE_GUARD_KEY=bhf_site_xxx
```

### 3. Copy the files into your Next.js project

```
middleware.ts        →  <project-root>/middleware.ts
lib/site-guard.ts   →  <project-root>/lib/site-guard.ts
```

Make sure `middleware.ts` is at the root of your Next.js project (same level as `app/` or `pages/`).

### 4. Configure your guarded paths

Edit `middleware.ts` and update `GUARDED_PREFIXES` and the `config.matcher` to match the paths you want to protect.

### 5. Configure Site Guard rules in the dashboard

Add rules for your site that allow or block specific paths. For example:

```
User-Agent pattern:  *Bot*
Allowed paths:       /docs/*
Blocked paths:       /admin/*
```

A path is **denied by default** unless an active matching rule explicitly allows it.

## Key behaviors

| Scenario | Result |
|---|---|
| Site Guard allows the path | `NextResponse.next()` — route runs |
| Site Guard denies the path | `403 Access denied by Site Guard.` |
| `SITE_GUARD_KEY` is not set | `403` (fail closed) |
| BehalfID returns a non-2xx | `403` (fail closed) |
| Network error / timeout | `403` (fail closed) |

## Security rules

- **`SITE_GUARD_KEY` is server-side only.** Next.js middleware runs on the server. Never import this helper from a Client Component or any module in the browser bundle.
- **No `siteId` in the body.** Site keys are scoped to one site — the key itself encodes the site. Do not add `siteId` or `domain` to the request body.
- **Fail closed.** Any error or missing configuration produces a `403`, never an accidental allow.
- **`blockedPaths` override `allowedPaths`.** A blocked path can never be allowed, even by another active rule.

## Test with curl

The middleware runs at the network edge, so you can test the underlying Site Guard check directly against the BehalfID API:

```bash
# Allowed request (path permitted by a rule)
curl https://behalfid.com/api/site-guard/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SITE_GUARD_KEY" \
  -d '{"path": "/docs/getting-started", "userAgent": "ExampleBot/1.0"}'

# Denied request (path blocked by a rule or no rule matches)
curl https://behalfid.com/api/site-guard/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SITE_GUARD_KEY" \
  -d '{"path": "/admin/settings", "userAgent": "ExampleBot/1.0"}'
```

For local development, set `BEHALFID_BASE_URL=http://localhost:3000` in `.env.local`.

## How the helper works

```ts
// lib/site-guard.ts — simplified

const response = await fetch(`${BEHALFID_BASE_URL}/api/site-guard/check`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SITE_GUARD_KEY}`,   // site key — server-side only
  },
  body: JSON.stringify({
    path: input.path,        // e.g. "/docs/api"
    userAgent: input.userAgent,
    agentIdentifier: input.agentIdentifier,  // optional
    // no siteId — the key already encodes the site
  }),
});

if (!response.ok) {
  return failClosed("Site Guard check returned an error.");
}

const decision = await response.json();
// decision.allowed === true  →  let the request through
// decision.allowed === false →  respond 403
```
