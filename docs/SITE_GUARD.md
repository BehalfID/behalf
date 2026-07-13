# BehalfID Site Guard

BehalfID Site Guard is an MVP policy check for website owners.

Permission passports answer:

```txt
Is this agent allowed to act for this user?
```

Site Guard answers:

```txt
Is this AI agent or crawler signal allowed to access this website route?
```

The check is separate from `/api/verify`. It runs only where a website installs an enforcement point such as app middleware, an edge worker, a gateway, or protected route code.

Site Guard is not a replacement for normal application authentication. It is a pre-access policy check for AI agents and crawlers. The application still owns user authentication, authorization, sessions, permissions, and any route-level access controls that apply after or alongside the Site Guard decision.

## Authentication

### Site keys (recommended)

Create a site key from the Site Guard site detail page in the dashboard. Each site key is scoped to exactly one site, so you do not send a `siteId` or `domain` in the request body — the key already encodes the site.

```txt
Authorization: Bearer bhf_site_xxx
```

Site keys must be kept server-side only. They are never safe to expose to browsers or crawler-visible content. The raw key is shown only once at creation time; copy it immediately and store it as an environment secret. Keys can be revoked from the dashboard at any time, immediately invalidating all future checks that use that key. A body-provided `siteId` or `domain` cannot override the site key's scope — the key's own `siteId` always wins.

### Developer tokens (legacy, backward-compatible)

The original MVP used developer tokens with `x-developer-token`. This path remains supported and will not be removed without notice, but site keys are now preferred because they are narrower in scope.

```txt
x-developer-token: bhf_dev_xxx
```

When using a developer token, `siteId` or `domain` is required in the request body to identify the site.

## Flow

```txt
website middleware
  -> POST /api/site-guard/check
  -> allow or deny
  -> origin route only after allow
```

## Rules

- Rules are active or disabled.
- Each rule matches either an exact `agentIdentifier` or a simple wildcard `userAgentPattern`.
- `allowedPaths` and `blockedPaths` accept absolute paths with exact or `*` wildcard matching.
- A path is denied unless an active matching rule explicitly allows it.
- A matching blocked path overrides an allowed path, including allows from other active matching rules.
- `requiresApproval` denies access in this MVP because Site Guard does not provide an approval workflow yet.

## Check endpoint

### With a site key

The `siteId` and `domain` fields are ignored when a site key is used. The key's own site scope applies.

```json
{
  "path": "/docs/api",
  "userAgent": "ExampleBot/1.0",
  "agentIdentifier": "crawler_example",
  "metadata": {
    "edge": "iad1"
  }
}
```

### With a developer token (legacy)

```json
{
  "siteId": "site_xxx",
  "path": "/docs/api",
  "userAgent": "ExampleBot/1.0",
  "agentIdentifier": "crawler_example",
  "metadata": {
    "edge": "iad1"
  }
}
```

`domain` can replace `siteId` in the developer-token path. `path` cannot contain a query string or fragment. Optional `metadata` must be an object under 2KB; secret-looking keys are redacted at input handling and metadata is not persisted in Site Guard logs today.

### Response

```json
{
  "allowed": true,
  "reason": "Path allowed by an active Site Guard rule.",
  "requestId": "req_xxx",
  "matchedRuleId": "sgr_xxx",
  "siteId": "site_xxx"
}
```

Unexpected policy errors fail closed.

## Dashboard integration panel

When you select a site at `/dashboard/sites`, the **Use this site** panel provides
copy-pasteable snippets for that site:

- **Environment** — `.env` entry pre-filled with your key (shown only immediately after
  creation) or the `bhf_site_REPLACE_ME` placeholder otherwise.
- **curl** — test the key from a terminal before deploying.
- **Next.js middleware** — drop-in `middleware.ts` ready to paste.
- **Express middleware** — `siteGuard()` factory ready to paste.

Site-key snippets never include `siteId` — the key already encodes the site scope.
`SITE_GUARD_KEY` is server-side only; the panel includes a prominent warning not to
expose it in browser code or client-visible responses.

If no active site keys exist, the panel shows a callout to create one first.

## SDK (`@behalfid/sdk`)

Install the SDK and pass a `bhf_site_...` key as `apiKey`. No `siteId` is
required in the call body — the key already encodes the site scope.

```bash
npm install @behalfid/sdk
```

```ts
import { BehalfID } from "@behalfid/sdk";
import type { SiteGuardCheckInput, SiteGuardCheckResult } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.SITE_GUARD_KEY!,  // bhf_site_... — server-side only
});

const decision = await behalf.siteGuard.check({
  path: "/docs/getting-started",
  userAgent: req.headers.get("user-agent") ?? undefined,
  agentIdentifier: "crawler_alpha",
});

if (!decision.allowed) {
  return new Response("Blocked", { status: 403 });
}
```

`siteGuard.check()` throws on network failure — wrap in try/catch and fail
closed (respond `403`) if it throws.

Exported types: `SiteGuardCheckInput`, `SiteGuardCheckResult`.

See the SDK README (`packages/sdk/README.md`) for middleware examples.

## Integration examples

Full, copy-ready examples live in the `examples/` directory:

| Example | Framework | Path |
|---|---|---|
| Next.js middleware | Next.js 15+ | `examples/site-guard-nextjs/` |
| Express middleware | Express 4+ | `examples/site-guard-express/` |
| Raw helper + curl | Any / none | `examples/site-guard-demo/` |

### Next.js middleware

See `examples/site-guard-nextjs/` for the complete example.  The short version:

```ts
// middleware.ts (project root, not inside app/)
import { NextResponse, type NextRequest } from "next/server";

const GUARDED_PREFIXES = ["/docs", "/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip /_next/ internals and static assets.
  if (pathname.startsWith("/_next/")) return NextResponse.next();

  // Only check guarded prefixes.
  if (!GUARDED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const response = await fetch(
    `${process.env.BEHALFID_BASE_URL}/api/site-guard/check`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SITE_GUARD_KEY}`,
      },
      body: JSON.stringify({
        path: pathname,
        userAgent: request.headers.get("user-agent") ?? "unknown",
        agentIdentifier: request.headers.get("behalfid-agent") ?? undefined,
        // no siteId — the site key already encodes the site
      }),
    },
  );

  // Fail closed on network error or non-2xx.
  if (!response.ok) {
    return new NextResponse("Site Guard unavailable.", { status: 403 });
  }

  const decision = await response.json();
  if (!decision.allowed) {
    return new NextResponse(decision.reason ?? "Denied by Site Guard.", { status: 403 });
  }

  return NextResponse.next();
}

export const config = { matcher: ["/docs/:path*", "/admin/:path*"] };
```

### Express middleware

See `examples/site-guard-express/` for the complete example.  The short version:

```ts
// src/siteGuard.ts
import type { Request, Response, NextFunction } from "express";

export function siteGuard() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = process.env.SITE_GUARD_KEY;
    if (!key) { res.status(403).send("SITE_GUARD_KEY not configured."); return; }

    let decision;
    try {
      const r = await fetch(
        `${process.env.BEHALFID_BASE_URL}/api/site-guard/check`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            path: req.path,
            userAgent: req.headers["user-agent"] ?? "unknown",
            agentIdentifier: req.headers["behalfid-agent"],
            // no siteId — the site key already encodes the site
          }),
        },
      );
      if (!r.ok) { res.status(403).send("Site Guard error."); return; }
      decision = await r.json();
    } catch {
      res.status(403).send("Site Guard unavailable."); return;
    }

    if (!decision.allowed) { res.status(403).send(decision.reason); return; }
    next();
  };
}

// src/server.ts
app.get("/docs/:slug?", siteGuard(), docsHandler);
app.get("/admin/:page?", siteGuard(), adminHandler);
```

### Raw API (curl)

```bash
# Allowed path:
curl https://www.behalfid.com/api/site-guard/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SITE_GUARD_KEY" \
  -d '{"path": "/docs/getting-started", "userAgent": "ExampleBot/1.0"}'

# Blocked path:
curl https://www.behalfid.com/api/site-guard/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SITE_GUARD_KEY" \
  -d '{"path": "/admin/settings", "userAgent": "ExampleBot/1.0"}'
```

### Integration sketch (site key)

```ts
const response = await fetch(`${process.env.BEHALFID_BASE_URL}/api/site-guard/check`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.SITE_GUARD_KEY}`
  },
  body: JSON.stringify({
    path: new URL(request.url).pathname,
    userAgent: request.headers.get("user-agent") ?? "unknown",
    agentIdentifier: request.headers.get("behalfid-agent") ?? undefined
    // no siteId — the key already encodes the site
  })
});

if (!response.ok || !(await response.json()).allowed) {
  return new Response("Denied by Site Guard.", { status: 403 });
}
```

### Integration sketch (developer token, legacy)

```ts
const response = await fetch(`${process.env.BEHALFID_BASE_URL}/api/site-guard/check`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-developer-token": process.env.BEHALFID_DEVELOPER_TOKEN!
  },
  body: JSON.stringify({
    siteId: process.env.BEHALFID_SITE_ID,
    path: new URL(request.url).pathname,
    userAgent: request.headers.get("user-agent") ?? "unknown",
    agentIdentifier: request.headers.get("behalfid-agent") ?? undefined
  })
});

const decision = await response.json();
if (!response.ok || !decision.allowed) {
  return new Response(decision.reason ?? "Denied by Site Guard.", { status: 403 });
}
```

## Fail-closed rules

Every integration point must obey the fail-closed contract:

| Event | Required behavior |
|---|---|
| `SITE_GUARD_KEY` not set | Respond `403` — do not serve the route |
| Network error / timeout | Respond `403` — do not serve the route |
| BehalfID returns non-2xx | Respond `403` — do not serve the route |
| `decision.allowed === false` | Respond `403` — do not serve the route |
| `decision.allowed === true` | Let the route handler run |

`blockedPaths` always override `allowedPaths`, even across multiple active matching rules.  A path that appears in `blockedPaths` on any matching rule cannot be allowed by any other rule.

When using a site key, do not include `siteId` or `domain` in the request body.  The key's own site scope always wins and a body-provided value cannot override it.

## Logs

For an existing site, Site Guard logs allowed and denied decisions with the `requestId`, owner identifiers, matched rule ID when one exists, domain, path, User-Agent signal, optional agent identifier, result, reason, risk, and timestamp.

It does not log cookies, authorization headers, site keys, developer tokens, query strings, page contents, prompts, request bodies, or optional metadata.

## Limitations

- No full reverse proxy or CDN.
- No provider-native identity, crawler registry, OAuth, or signed crawler identity.
- No billing or advanced policy language.
- User-Agent and caller-supplied agent identifiers are weak signals.
- Site Guard cannot block traffic where the site does not install and honor the check.
