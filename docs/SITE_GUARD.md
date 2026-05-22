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

## Integration sketch

### Site key (recommended)

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
  })
});

const decision = await response.json();
if (!response.ok || !decision.allowed) {
  return new Response(decision.reason ?? "Denied by Site Guard.", { status: 403 });
}
```

### Developer token (legacy)

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

See `examples/site-guard-demo` for a small helper and allowed/denied requests.

## Logs

For an existing site, Site Guard logs allowed and denied decisions with the `requestId`, owner identifiers, matched rule ID when one exists, domain, path, User-Agent signal, optional agent identifier, result, reason, risk, and timestamp.

It does not log cookies, authorization headers, site keys, developer tokens, query strings, page contents, prompts, request bodies, or optional metadata.

## Limitations

- No full reverse proxy or CDN.
- No provider-native identity, crawler registry, OAuth, or signed crawler identity.
- No billing or advanced policy language.
- User-Agent and caller-supplied agent identifiers are weak signals.
- Site Guard cannot block traffic where the site does not install and honor the check.
