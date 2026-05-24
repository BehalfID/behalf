import { CodeBlock, DocsShell } from "../content";

const mvpRules = [
  ["Deny by default", "A route stays denied until an active matching rule allows its path."],
  ["Match simple signals", "Rules match an exact agent identifier or a wildcard User-Agent pattern."],
  ["Block before allow", "A matching blocked path overrides any matching allowed path."],
  ["Log decisions", "Existing-site checks record safe decision metadata and a request ID."]
];

export default function SiteGuardDocsPage() {
  return (
    <DocsShell
      title="BehalfID Site Guard"
      description="MVP website-route access checks for AI agent and crawler signals. Check before access, deny by default, and log the decision."
      previous={{ href: "/docs/webhooks", label: "Webhooks" }}
      next={{ href: "/docs/concepts", label: "Concepts" }}
    >
      <h2>What Site Guard is</h2>
      <p>
        Site Guard lets a website owner check a simple site rule before protected content
        or workflows are served. Permission passports answer whether an agent may act for
        a user; Site Guard answers whether an AI agent or crawler signal may access a
        website route where the site installed the check.
      </p>
      <p>
        This MVP is a policy endpoint, not a reverse proxy. It relies on your middleware,
        worker, gateway, or route code to call BehalfID and honor denied decisions.
      </p>
      <p>
        Site Guard is not a replacement for application authentication. It is a pre-access
        policy check for AI agents and crawlers. Your app still enforces user auth,
        authorization, sessions, permissions, and route access controls.
      </p>

      <h2>Dashboard snippets</h2>
      <p>
        The fastest way to get started is the{" "}
        <a href="/dashboard/sites">Site Guard dashboard</a>. Select a site to open the
        <strong> Use this site</strong> panel, which provides ready-to-copy curl, Next.js,
        and Express snippets scoped to that site. Site-key snippets omit <code>siteId</code>{" "}
        — the key already encodes the site. <code>SITE_GUARD_KEY</code> is server-side only;
        never expose it in browser code.
      </p>

      <h2>SDK (@behalfid/sdk)</h2>
      <p>
        Install the SDK and pass a <code>bhf_site_...</code> key as{" "}
        <code>apiKey</code>. No <code>siteId</code> is required — the key already
        encodes the site scope.
      </p>
      <CodeBlock label="install">{`npm install @behalfid/sdk`}</CodeBlock>
      <CodeBlock label="usage">{`import { BehalfID } from "@behalfid/sdk";
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
}`}</CodeBlock>
      <p>
        <code>siteGuard.check()</code> throws on network failure — wrap it in{" "}
        <code>try/catch</code> and fail closed (respond <code>403</code>) if it
        throws. See the <strong>Fail-closed rules</strong> table below.
      </p>
      <p>
        Exported types: <code>SiteGuardCheckInput</code>,{" "}
        <code>SiteGuardCheckResult</code>.
      </p>

      <h2>Site keys (recommended)</h2>
      <p>
        Create a site key (<code>bhf_site_...</code>) from the site detail page in your
        dashboard. Site keys are scoped to a single site — the key cannot check a different
        site, even with a valid credential. Use <code>Authorization: Bearer</code> and omit{" "}
        <code>siteId</code> from the request body.
      </p>
      <CodeBlock label="request">{`POST /api/site-guard/check
Authorization: Bearer bhf_site_xxx
Content-Type: application/json

{
  "path": "/docs/api",
  "userAgent": "ExampleBot/1.0",
  "agentIdentifier": "crawler_example"
}`}</CodeBlock>
      <CodeBlock label="response">{`{
  "allowed": true,
  "reason": "Path allowed by an active Site Guard rule.",
  "requestId": "req_xxx",
  "matchedRuleId": "sgr_xxx",
  "siteId": "site_xxx"
}`}</CodeBlock>
      <p>
        Set <code>SITE_GUARD_KEY=bhf_site_xxx</code> in your environment. The raw key is
        shown only once at creation time. Store it in a secret manager or environment
        variable — it cannot be retrieved again.
      </p>

      <h2>Developer token (legacy)</h2>
      <p>
        Developer tokens (<code>bhf_dev_...</code>) in <code>x-developer-token</code> are
        still accepted for backwards compatibility but are broader than ideal for website
        middleware. Prefer site keys for new integrations.
      </p>
      <CodeBlock label="request">{`POST /api/site-guard/check
x-developer-token: bhf_dev_xxx
Content-Type: application/json

{
  "siteId": "site_xxx",
  "path": "/docs/api",
  "userAgent": "ExampleBot/1.0",
  "agentIdentifier": "crawler_example"
}`}</CodeBlock>

      <h2>Rule behavior</h2>
      <div className="endpoint-list">
        {mvpRules.map(([title, body]) => (
          <div className="endpoint-card" key={title}>
            <span>Rule</span>
            <code>{title}</code>
            <p>{body}</p>
          </div>
        ))}
      </div>
      <p>
        Path patterns support exact paths and <code>*</code> wildcards, such as{" "}
        <code>/docs/api</code> or <code>/docs/*</code>. User-Agent is a weak signal and
        is not proof of provider identity.
      </p>

      <h2>Next.js middleware</h2>
      <p>
        Place <code>middleware.ts</code> at the project root (same level as <code>app/</code>).
        It runs server-side before any route handler. See{" "}
        <code>examples/site-guard-nextjs/</code> for the full example.
      </p>
      <CodeBlock label="middleware.ts">{`import { NextResponse, type NextRequest } from "next/server";

const GUARDED_PREFIXES = ["/docs", "/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static assets.
  if (pathname.startsWith("/_next/")) return NextResponse.next();
  if (!GUARDED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let decision;
  try {
    const r = await fetch(
      \`\${process.env.BEHALFID_BASE_URL}/api/site-guard/check\`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Site key — server-side only, never sent to the browser.
          Authorization: \`Bearer \${process.env.SITE_GUARD_KEY}\`,
        },
        body: JSON.stringify({
          path: pathname,
          userAgent: request.headers.get("user-agent") ?? "unknown",
          agentIdentifier: request.headers.get("behalfid-agent") ?? undefined,
          // no siteId — the site key already encodes the site
        }),
      },
    );
    // Fail closed on non-2xx.
    if (!r.ok) return new NextResponse("Site Guard unavailable.", { status: 403 });
    decision = await r.json();
  } catch {
    // Fail closed on network error.
    return new NextResponse("Site Guard unavailable.", { status: 403 });
  }

  if (!decision.allowed) {
    return new NextResponse(decision.reason ?? "Denied by Site Guard.", { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/docs/:path*", "/admin/:path*"] };`}</CodeBlock>

      <h2>Express middleware</h2>
      <p>
        Call <code>siteGuard()</code> before the route handler. The middleware
        responds <code>403</code> on deny or error without calling{" "}
        <code>next()</code>. See <code>examples/site-guard-express/</code> for
        the full example.
      </p>
      <CodeBlock label="src/siteGuard.ts">{`import type { Request, Response, NextFunction } from "express";

export function siteGuard() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = process.env.SITE_GUARD_KEY;
    // Fail closed — cannot verify without a key.
    if (!key) { res.status(403).send("SITE_GUARD_KEY not configured."); return; }

    let decision;
    try {
      const r = await fetch(
        \`\${process.env.BEHALFID_BASE_URL}/api/site-guard/check\`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: \`Bearer \${key}\`,
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
    next(); // allowed — route handler runs
  };
}

// Usage:
// app.get("/docs/:slug", siteGuard(), docsHandler);
// app.get("/admin/:page", siteGuard(), adminHandler);`}</CodeBlock>

      <h2>Fail-closed rules</h2>
      <p>
        Every integration point must fail closed. A route must not be served
        unless Site Guard explicitly returns <code>allowed: true</code>.
      </p>
      <div className="endpoint-list">
        {[
          ["SITE_GUARD_KEY not set", "Respond 403 — do not serve the route."],
          ["Network error or timeout", "Respond 403 — do not serve the route."],
          ["BehalfID returns non-2xx", "Respond 403 — do not serve the route."],
          ["decision.allowed === false", "Respond 403 — do not serve the route."],
          ["decision.allowed === true", "Allow — let the route handler run."]
        ].map(([event, behavior]) => (
          <div className="endpoint-card" key={event}>
            <span>Behavior</span>
            <code>{event}</code>
            <p>{behavior}</p>
          </div>
        ))}
      </div>
      <p>
        <code>SITE_GUARD_KEY</code> is server-side only. Never import the helper
        from a Client Component or any module in the browser bundle. When using a
        site key, omit <code>siteId</code> and <code>domain</code> from the
        request body — the key already encodes the site scope and a body-provided
        value cannot override it.
      </p>

      <h2>Test with curl</h2>
      <CodeBlock label="allowed path">{`curl https://behalfid.com/api/site-guard/check \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $SITE_GUARD_KEY" \\
  -d '{"path": "/docs/getting-started", "userAgent": "ExampleBot/1.0"}'`}</CodeBlock>
      <CodeBlock label="blocked path">{`curl https://behalfid.com/api/site-guard/check \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $SITE_GUARD_KEY" \\
  -d '{"path": "/admin/settings", "userAgent": "ExampleBot/1.0"}'`}</CodeBlock>

      <h2>Middleware sketch (raw)</h2>
      <CodeBlock label="middleware.ts">{`const response = await fetch(\`\${process.env.BEHALFID_BASE_URL}/api/site-guard/check\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${process.env.SITE_GUARD_KEY}\`
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
}`}</CodeBlock>

      <h2>Logs and limits</h2>
      <ul className="docs-list">
        <li>Existing-site checks log the request ID, site, matched rule when any, path, signals, result, reason, risk, and timestamp.</li>
        <li>Logs do not store cookies, auth headers, tokens, query strings, page content, request bodies, or optional metadata.</li>
        <li>The MVP has no crawler registry, provider-native identity, OAuth, billing, or advanced policy language.</li>
        <li>Site Guard cannot block uninstrumented website traffic.</li>
      </ul>
    </DocsShell>
  );
}
