# @behalfid/sdk

JavaScript SDK for BehalfID. Requires Node.js 18+.

## Install

```bash
npm install @behalfid/sdk
```

## Verify An Action

```js
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY,
  baseUrl: "https://behalfid.com"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "access_data",
  vendor: "gmail.com"
});

if (!result.allowed) {
  throw new Error(`Blocked by BehalfID: ${result.reason}`);
}

// proceed only after BehalfID allows the action
```

## Site Guard

Use a `bhf_site_...` key to check whether a path may be served.  The site key
is scoped to a single site, so you do **not** include `siteId` in the body.

```ts
import { BehalfID } from "@behalfid/sdk";
import type { SiteGuardCheckInput, SiteGuardCheckResult } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.SITE_GUARD_KEY!,   // bhf_site_... — server-side only
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

**Fail-closed rules:**

| Event | Required behavior |
|---|---|
| `SITE_GUARD_KEY` not set | Respond `403` — do not serve the route |
| This call throws (network error) | Respond `403` — do not serve the route |
| `decision.allowed === false` | Respond `403` — do not serve the route |
| `decision.allowed === true` | Serve the route |

`SITE_GUARD_KEY` must remain **server-side only**. Never include it in browser
code or client-visible responses.

### Next.js middleware example

```ts
// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({ apiKey: process.env.SITE_GUARD_KEY! });
const GUARDED_PREFIXES = ["/docs", "/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next/")) return NextResponse.next();
  if (!GUARDED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let decision;
  try {
    decision = await behalf.siteGuard.check({
      path: pathname,
      userAgent: request.headers.get("user-agent") ?? undefined,
      agentIdentifier: request.headers.get("behalfid-agent") ?? undefined,
    });
  } catch {
    // Fail closed on network error.
    return new NextResponse("Site Guard unavailable.", { status: 403 });
  }

  if (!decision.allowed) {
    return new NextResponse(decision.reason ?? "Denied.", { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/docs/:path*", "/admin/:path*"] };
```

## Methods

- `verify(input)`
- `executeAction(input)`
- `createAgent(nameOrInput)`
- `createPermission(input)`
- `rotateKey(agentId)`
- `getLogs(agentId)`
- `siteGuard.check(input)` — check a path with a site key (`bhf_site_...`)
- `verifyWebhookSignature(input)`

`createAgent` uses the configured `apiKey` as a bearer token. When public agent creation is disabled, pass a server-side `BEHALFID_SETUP_TOKEN` as the SDK `apiKey` for provisioning.

For non-transaction actions, the current API field `vendor` can represent the resource or service being accessed; `resource` is also accepted by `/api/verify`. Pass `amount` only when verifying purchase or transaction-like actions. Active `blockedActions` override allows, and non-empty `allowedActions` narrow a permission to exact action strings. Missing constrained `vendor`/`resource` or `amount` values fail closed.

For connected agents, pass metadata instead of just a name:

```js
const agent = await behalf.createAgent({
  name: "Ollie",
  agentType: "connected",
  provider: "ollie",
  externalAgentLabel: "Jasper's Ollie assistant",
  description: "Personal assistant used for planning"
});
```

Connected-agent metadata is descriptive only. It does not authenticate with the external provider.

Do not log API keys. Created and rotated API keys are returned once by the BehalfID API.

## Verify Webhooks

```js
import { verifyWebhookSignature } from "@behalfid/sdk";

const valid = await verifyWebhookSignature({
  secret: process.env.BEHALFID_WEBHOOK_SECRET,
  payload: rawBody,
  timestamp: req.headers["behalfid-timestamp"],
  signature: req.headers["behalfid-signature"]
});
```

Use the raw request body exactly as received. The helper derives the same signing key BehalfID uses from the one-time `whsec_` secret. BehalfID webhook delivery is at least once, so receivers should deduplicate by event ID. Do not log webhook secrets.

## Network access

`@behalfid/sdk` uses the global `fetch` API to call the BehalfID API. This is expected and required — the SDK is an API client and cannot function without network access.

**What makes network requests:**

- `verify()`, `createAgent()`, `createPermission()`, `rotateKey()`, and `getLogs()` each call `fetch` to the configured `baseUrl`.
- All requests include an `Authorization: Bearer <apiKey>` header. The API key is never sent to any other host.
- `verifyWebhookSignature()` performs local HMAC-SHA256 verification using `node:crypto`. It makes no network requests.

**What does not make network requests:**

- Importing the package — no side effects on import.
- Constructing a `BehalfID` instance — no network call is made until a method is invoked.

**Security recommendations:**

- Set `baseUrl` explicitly in production. The default points to the official BehalfID deployment.
- Do not pass untrusted user input as `baseUrl`. The constructor requires a valid `https://` URL by default and will throw for plaintext HTTP.
- For local development only, pass `allowInsecureHttp: true` when using an `http://localhost` `baseUrl`.
- Do not log the `apiKey` or store it in client-side code.

**Socket.dev / supply-chain scanners:**

Static analysis tools including Socket.dev report a _Network access_ alert for this package because `globalThis["fetch"]` is detected in `dist/client.js`. This is intentional and expected for an API client SDK. The only host contacted is the value of `baseUrl` (defaulting to `https://behalfid.com`).
