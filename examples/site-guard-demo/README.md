# Site Guard Demo

This small TypeScript helper shows the Site Guard MVP integration point. A website calls BehalfID from server-side middleware, a worker, or protected route code before serving the route.

1. Create a developer token in `/dashboard/settings`.
2. Create a site and rule in `/dashboard/sites`.
3. Copy `.env.example` to your local example environment and fill in the token and site ID.
4. Call `checkSiteGuard()` before the protected route runs.

Example rule:

```txt
User-Agent pattern: ExampleBot/*
Allowed paths: /docs/*
Blocked paths: /docs/private/*
```

Allowed request:

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

Denied request using the same rule:

```bash
curl http://localhost:3000/api/site-guard/check \
  -H "Content-Type: application/json" \
  -H "x-developer-token: $BEHALFID_DEVELOPER_TOKEN" \
  -d '{
    "siteId": "'"$BEHALFID_SITE_ID"'",
    "path": "/docs/private/keys",
    "userAgent": "ExampleBot/1.0"
  }'
```

The endpoint denies by default when no active rule allows a path. Matching blocked paths override allowed paths. Keep the developer token out of browsers and crawler-visible content.
