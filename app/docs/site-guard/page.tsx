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

      <h2>Site keys (recommended)</h2>
      <p>
        Create a site key (<code>bhf_site_...</code>) from the site detail page in your
        dashboard. Site keys are scoped to a single site — the key cannot check a different
        site, even with a valid credential. Use <code>Authorization: Bearer</code> and omit
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

      <h2>Middleware sketch</h2>
      <CodeBlock label="middleware.ts">{`const decision = await fetch(\`\${process.env.BEHALFID_BASE_URL}/api/site-guard/check\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${process.env.SITE_GUARD_KEY}\`
  },
  body: JSON.stringify({
    path: new URL(request.url).pathname,
    userAgent: request.headers.get("user-agent") ?? "unknown",
    agentIdentifier: request.headers.get("behalfid-agent") ?? undefined
  })
}).then((response) => response.json());

if (!decision.allowed) {
  return new Response(decision.reason, { status: 403 });
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
