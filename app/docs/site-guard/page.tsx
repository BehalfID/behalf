import { CodeBlock, DocsShell } from "../content";

const eventualRules = [
  ["Allow public page reads", "Let agents read and summarize public content when they cite the source."],
  ["Block sensitive workflows", "Deny form submissions, checkout paths, account creation, login attempts, or admin actions."],
  ["Require verified agent identity", "For sensitive routes, require a future verifiable BehalfID agent credential instead of trusting User-Agent strings."],
  ["Rate-limit AI traffic", "Apply site-owner rules to crawler-like traffic at middleware, worker, or gateway boundaries."],
  ["Audit access attempts", "Record safe decision metadata without storing cookies, authorization headers, page content, or raw query strings."]
];

export default function SiteGuardDocsPage() {
  return (
    <DocsShell
      title="BehalfID Site Guard"
      description="A planned AI access gateway for website owners. Define site rules, install an enforcement point, and fail closed before protected workflows run."
      previous={{ href: "/docs/webhooks", label: "Webhooks" }}
      next={{ href: "/docs/concepts", label: "Concepts" }}
    >
      <h2>What Site Guard is</h2>
      <p>
        BehalfID Site Guard lets website owners define and enforce how AI agents access
        their content, forms, and workflows. <code>llms.txt</code> can declare intent;
        Site Guard is the enforcement layer when installed as middleware, a proxy, an edge
        worker, or another controlled gateway.
      </p>
      <p>
        This is complementary to permission passports. Passports answer:{" "}
        <strong>is this agent allowed to act for this user?</strong> Site Guard answers:{" "}
        <strong>is this agent or automation allowed to access or act on this website?</strong>
      </p>

      <h2>Enforcement point</h2>
      <ol className="docs-steps">
        <li><strong>Traffic reaches your site.</strong> An AI agent, crawler, browser automation, or app requests a route.</li>
        <li><strong>Your middleware or worker calls BehalfID.</strong> It sends the site ID, route, method, intended action, declared purpose, and safe request signals.</li>
        <li><strong>BehalfID evaluates site rules.</strong> The decision can allow, deny, rate-limit, or require verified agent identity.</li>
        <li><strong>Your site fails closed.</strong> Denied checks return before the origin route, checkout, form handler, or workflow executes.</li>
      </ol>

      <h2>Important limitation</h2>
      <p>
        Site Guard cannot stop all AI traffic globally by itself. It only enforces rules where
        the website installs a middleware, proxy, worker, or gateway that calls BehalfID and
        respects the decision. User-Agent detection is a weak signal; verified agent identity
        requires a signed credential in a future iteration.
      </p>

      <h2>Future policy check endpoint</h2>
      <p>
        The first backend milestone should add a separate site-key authenticated endpoint.
        It should not reuse agent API keys, passport tokens, or dashboard cookies.
      </p>
      <CodeBlock label="planned request">{`POST /api/site-guard/check
Authorization: Bearer bhf_site_xxx
Content-Type: application/json

{
  "siteId": "site_xxx",
  "method": "POST",
  "path": "/checkout",
  "action": "checkout",
  "declaredPurpose": "compare products",
  "agentId": "agent_xxx"
}`}</CodeBlock>
      <CodeBlock label="planned response">{`{
  "allowed": false,
  "decision": "denied",
  "reason": "This site blocks AI checkout actions.",
  "siteId": "site_xxx",
  "ruleId": "rule_xxx"
}`}</CodeBlock>

      <h2>Middleware sketch</h2>
      <p>
        This is the intended developer experience, not a shipped package yet. A future
        <code> @behalfid/site-guard</code> package or Cloudflare Worker template should wrap
        this pattern without exposing site secrets to browsers.
      </p>
      <CodeBlock label="middleware.ts">{`const decision = await fetch("https://behalfid.com/api/site-guard/check", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.BEHALFID_SITE_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    siteId: process.env.BEHALFID_SITE_ID,
    method: request.method,
    path: new URL(request.url).pathname,
    action: "submit_form",
    declaredPurpose: request.headers.get("BehalfID-Purpose")
  })
}).then((response) => response.json());

if (!decision.allowed) {
  return new Response(decision.reason, { status: 403 });
}`}</CodeBlock>

      <h2>Rules Site Guard should support</h2>
      <div className="endpoint-list">
        {eventualRules.map(([title, body]) => (
          <div className="endpoint-card" key={title}>
            <span>Rule</span>
            <code>{title}</code>
            <p>{body}</p>
          </div>
        ))}
      </div>

      <h2>Deferred by design</h2>
      <ul className="docs-list">
        <li>No full reverse proxy or CDN in the first Site Guard milestone.</li>
        <li>No claims that User-Agent or self-declared headers prove agent identity.</li>
        <li>No arbitrary URL forwarding to BehalfID or raw proxying through the app.</li>
        <li>No SDK behavior changes until the site-key policy endpoint exists.</li>
      </ul>
    </DocsShell>
  );
}
