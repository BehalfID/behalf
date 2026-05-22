# Site Guard Demo

This small TypeScript helper shows the Site Guard integration point using a **site key**. A website calls BehalfID from server-side middleware, a worker, or protected route code before serving the route.

## Setup

1. Create a site in `/dashboard/sites`.
2. Open the site detail page and create a site key under **Site keys**. Copy the raw key immediately — it is shown only once and cannot be retrieved again.
3. Copy `.env.example` to your local example environment and fill in the site key.
4. Call `checkSiteGuard()` before the protected route runs.

> **Server-side only.** Keep `SITE_GUARD_KEY` out of browsers, client bundles, and any response that crawler or browser traffic can read.

## How site keys work

- The key is scoped to exactly one site. You do not send a `siteId` or `domain` in the request body — the key already encodes the site.
- Authenticate with `Authorization: Bearer $SITE_GUARD_KEY`.
- A body-provided `siteId` or `domain` cannot override the key's scope.
- Keys can be revoked from the dashboard at any time, immediately invalidating further checks.

## Example rule

```txt
User-Agent pattern: ExampleBot/*
Allowed paths: /docs/*
Blocked paths: /docs/private/*
```

## Allowed request (site key)

```bash
curl http://localhost:3000/api/site-guard/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SITE_GUARD_KEY" \
  -d '{
    "path": "/docs/api",
    "userAgent": "ExampleBot/1.0",
    "agentIdentifier": "crawler_example"
  }'
```

## Denied request (site key)

```bash
curl http://localhost:3000/api/site-guard/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SITE_GUARD_KEY" \
  -d '{
    "path": "/docs/private/keys",
    "userAgent": "ExampleBot/1.0"
  }'
```

## Developer token (legacy, backward-compatible)

The original MVP used a developer token with `x-developer-token` and a `siteId` in the body. This path remains supported but site keys are preferred.

```bash
curl http://localhost:3000/api/site-guard/check \
  -H "Content-Type: application/json" \
  -H "x-developer-token: $BEHALFID_DEVELOPER_TOKEN" \
  -d '{
    "siteId": "'"$BEHALFID_SITE_ID"'",
    "path": "/docs/api",
    "userAgent": "ExampleBot/1.0",
    "agentIdentifier": "crawler_example"
  }'
```

The endpoint denies by default when no active rule allows a path. Matching blocked paths override allowed paths.
