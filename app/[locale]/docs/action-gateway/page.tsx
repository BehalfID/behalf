import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, DocsShell } from "../content";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "docs" });
  return { title: `${t("actionGateway")} — BehalfID`, description: "Route safe public web reads through BehalfID so denied actions fail before execution. Proxy HTTP requests with permission enforcement built in.", alternates: { canonical: "/docs/action-gateway" } };
}

export default async function ActionGatewayDocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title="Action Gateway"
      description="Verify checks whether an action is allowed. The Action Gateway enforces that decision by executing only supported allowed actions through BehalfID."
      previous={{ href: "/docs/sdk", label: t("sdk") }}
      next={{ href: "/docs/webhooks", label: t("webhooks") }}
    >
      <h2>When to use the gateway</h2>
      <p>
        Use <code>verify()</code> when your app already owns the executor and only needs a
        allow/deny decision. Use the Action Gateway when you want BehalfID to both decide
        and perform a narrow, safe action — today that means a public web GET — so denied
        or unsupported requests never reach your fetch logic.
      </p>
      <p>
        Passports define permissions. Verify checks those permissions. The gateway adds an
        execution boundary: denied or unsupported actions return <code>executed: false</code>,
        and BehalfID does not fetch after denial.
      </p>

      <h2>MVP scope</h2>
      <p>
        The current gateway supports one executor: public web reads. It accepts{" "}
        <code>browse_web</code> on the <code>web</code> resource, fetches a public URL with
        GET, and returns status, content type, optional title, and a limited text excerpt.
      </p>
      <p>
        The gateway does not submit forms, log in, purchase items, send email, write
        calendars, run browser automation, forward arbitrary headers, or use credentials or
        cookies.
      </p>
      <ul className="docs-list">
        <li>Supported action: <code>browse_web</code></li>
        <li>Supported resource: <code>web</code> (passed as <code>vendor</code> during verify)</li>
        <li>Required input field: <code>input.url</code></li>
        <li>Auth: agent API key (<code>Authorization: Bearer bhf_sk_…</code>)</li>
      </ul>

      <h2>Request shape</h2>
      <CodeBlock label="request.json">{`{
  "agentId": "agent_xxx",
  "action": "browse_web",
  "resource": "web",
  "input": {
    "url": "https://example.com"
  }
}`}</CodeBlock>
      <CodeBlock label="curl">{`curl -X POST "$BASE_URL/api/actions/execute" \\
  -H "Authorization: Bearer $BEHALFID_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"agent_xxx","action":"browse_web","resource":"web","input":{"url":"https://example.com"}}'`}</CodeBlock>
      <CodeBlock label="sdk.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! });

const result = await behalf.executeAction({
  agentId: process.env.BEHALFID_AGENT_ID!,
  action: "browse_web",
  resource: "web",
  input: { url: "https://example.com" }
});

if (result.executed) {
  console.log(result.result?.title, result.result?.excerpt);
}`}</CodeBlock>

      <h2>Response shapes</h2>
      <p>
        Allowed and executed responses include the fetch result. Denied decisions never
        fetch. Permission must allow <code>browse_web</code> on <code>web</code>; otherwise
        the gateway returns <code>executed: false</code>.
      </p>
      <CodeBlock label="allowed + executed">{`{
  "requestId": "req_xxx",
  "allowed": true,
  "decision": "allowed",
  "reason": "Action allowed by active permission.",
  "executed": true,
  "result": {
    "url": "https://example.com/",
    "status": 200,
    "contentType": "text/html",
    "title": "Example Domain",
    "excerpt": "Example Domain…",
    "truncated": false
  }
}`}</CodeBlock>
      <CodeBlock label="denied (no fetch)">{`{
  "requestId": "req_xxx",
  "allowed": false,
  "decision": "denied",
  "reason": "No matching permission found.",
  "executed": false
}`}</CodeBlock>
      <CodeBlock label="allowed but fetch failed">{`{
  "requestId": "req_xxx",
  "allowed": true,
  "decision": "allowed",
  "reason": "Action allowed by active permission.",
  "executed": false,
  "error": "Gateway redirect limit exceeded."
}`}</CodeBlock>

      <h2>Fail-closed rules</h2>
      <div className="endpoint-list">
        {[
          ["Missing / invalid JSON fields", "400 — request rejected before verify."],
          ["Unsupported action or resource", "Verified as denied with reason that MVP only supports browse_web on web."],
          ["decision.allowed === false", "executed: false — no network fetch."],
          ["Verification throws / unavailable", "503 with executed: false."],
          ["SSRF / private URL / bad redirect", "400 with allowed: true, executed: false, and error message."],
          ["decision.allowed === true + successful GET", "executed: true with result excerpt."]
        ].map(([event, behavior]) => (
          <div className="endpoint-card" key={event}>
            <span>Behavior</span>
            <code>{event}</code>
            <p>{behavior}</p>
          </div>
        ))}
      </div>

      <h2>Security controls</h2>
      <ul className="docs-list">
        <li>Only <code>GET</code> is used.</li>
        <li>No cookies, credentials, or user-supplied request headers are sent.</li>
        <li>Only <code>http://</code> and <code>https://</code> URLs are accepted.</li>
        <li>Localhost, private IP ranges, link-local addresses, metadata IPs, and internal hostnames are blocked (SSRF protection).</li>
        <li>Redirects are followed manually (max 3); each target is re-validated.</li>
        <li>Requests time out at 5 seconds; response bodies are capped at 64 KB before excerpts are returned.</li>
      </ul>

      <h2>Webhooks and audit</h2>
      <p>
        Each gateway call emits <code>verification.allowed</code> or{" "}
        <code>verification.denied</code> like a normal verify. See{" "}
        <Link href="/docs/webhooks">Webhooks</Link> for delivery details and{" "}
        <Link href="/docs/quickstart">SDK Quickstart</Link> for the fail-closed executor
        pattern when you keep execution in your own process.
      </p>

      <h2>Runnable demo</h2>
      <p>
        The <code>examples/enforcement-demo</code> package creates permissions, runs an
        allowed web read through the Action Gateway, proves denied executors do not run,
        and checks that request IDs appear in audit logs.
      </p>
      <CodeBlock label="terminal">{`cd examples/enforcement-demo
npm install
cp .env.example .env
npm run setup
npm run demo`}</CodeBlock>

      <h2>Later connectors</h2>
      <p>
        Future connectors can add more actions, but each needs its own narrow executor,
        permission check, input validation, and fail-closed behavior. Unsupported actions
        today are denied rather than forwarded.
      </p>
    </DocsShell>
  );
}
