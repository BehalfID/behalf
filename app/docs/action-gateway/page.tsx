import { CodeBlock, DocsShell } from "../content";

export default function ActionGatewayDocsPage() {
  return (
    <DocsShell
      title="Action Gateway"
      description="Verify checks whether an action is allowed. The Action Gateway enforces that decision by executing only supported allowed actions through BehalfID."
      previous={{ href: "/docs/sdk", label: "JavaScript SDK" }}
      next={{ href: "/docs/webhooks", label: "Webhooks" }}
    >
      <h2>MVP scope</h2>
      <p>
        The current gateway supports one safe executor: public web reads. It accepts
        <code> browse_web</code> on the <code>web</code> resource, fetches a public URL with GET,
        and returns a status, content type, optional title, and limited text excerpt.
      </p>
      <p>
        The gateway does not submit forms, log in, purchase items, send email, write calendars,
        run arbitrary browser automation, forward arbitrary headers, or use credentials or cookies.
      </p>
      <h2>Fail closed</h2>
      <p>
        Passports define permissions. Verify checks those permissions. The gateway adds an execution
        boundary: denied or unsupported actions return <code>executed: false</code>, and BehalfID does
        not fetch or perform anything after denial.
      </p>
      <p>
        The gateway verifies before any executor runs. A denied decision, approval-required
        permission, missing constrained input, unsupported action, or verification failure stops
        the flow before the public-web-read fetch is attempted.
      </p>
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
      <h2>Security controls</h2>
      <ul className="docs-list">
        <li>Only <code>GET</code> is used.</li>
        <li>No cookies, credentials, or user-supplied request headers are sent.</li>
        <li>Only <code>http://</code> and <code>https://</code> URLs are accepted.</li>
        <li>Localhost, private IP ranges, link-local addresses, metadata IPs, and internal hostnames are blocked.</li>
        <li>Redirects are followed manually and each target is validated before another fetch occurs.</li>
        <li>Requests have a timeout and response bodies are capped before excerpts are returned.</li>
      </ul>
      <h2>Later connectors</h2>
      <p>
        Future connectors can add more actions, but each connector needs its own narrow executor,
        permission check, input validation, and fail-closed behavior.
      </p>
    </DocsShell>
  );
}
