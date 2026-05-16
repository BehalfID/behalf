import { CodeBlock, DocsShell } from "../content";

const endpoints = [
  ["POST", "/api/agents", "Add a native or connected agent and return the API key once."],
  ["POST", "/api/permissions", "Create a permission for the authenticated agent."],
  ["POST", "/api/verify", "Evaluate whether an agent can perform an action."],
  ["POST", "/api/actions/execute", "Execute an allowed safe public web read through the Action Gateway MVP."],
  ["GET", "/api/logs/[agentId]", "Read recent verification logs for the authenticated agent."],
  ["POST", "/api/agents/[agentId]/rotate-key", "Rotate an agent API key and return the new key once."]
];
const passportEndpoints = [
  ["GET", "/api/passport/[agentId]", "Read safe public passport data: agent metadata and active permission scopes. Returns passportVersion, mode, agent, permissions, and limitations. Never returns API keys, logs, developer identity, or internal IDs."],
  ["POST", "/api/passport/[agentId]", "Run a manual allow/deny preview without exposing the agent API key. Does not write logs or trigger webhooks."]
];

export default function ApiDocsPage() {
  return (
    <DocsShell
      title="API reference"
      description="Agent API keys use Authorization: Bearer bhf_sk_xxx. Dashboard routes use developer session cookies."
      previous={{ href: "/docs/cli", label: "CLI" }}
      next={{ href: "/docs/sdk", label: "JavaScript SDK" }}
    >
      <div className="endpoint-list">
        {endpoints.map(([method, path, body]) => (
          <div className="endpoint-card" key={path}>
            <span>{method}</span>
            <code>{path}</code>
            <p>{body}</p>
          </div>
        ))}
      </div>
      <h2>Agent metadata</h2>
      <p>
        <code>POST /api/agents</code> remains compatible with <code>{`{ "name": "Jasper Shopping Agent" }`}</code>.
        It also accepts optional connected-agent metadata.
      </p>
      <CodeBlock label="connected-agent.json">{`{
  "name": "Ollie",
  "agentType": "connected",
  "provider": "ollie",
  "externalAgentId": "optional",
  "externalAgentLabel": "Jasper's Ollie assistant",
  "description": "Family/personal assistant used for daily planning"
}`}</CodeBlock>
      <h2>Permission shape</h2>
      <p>
        A permission is an action plus constraints. The current public API keeps
        <code> vendor</code> and <code>allowedVendors</code> for compatibility; <code>resource</code>
        is also accepted by <code>/api/verify</code> and passport preview routes as a clearer alias.
        <code> amount</code> is optional and mainly relevant to transaction-like permissions.
      </p>
      <p>
        Agent descriptions are informational. Permissions are the source of truth for what an agent
        may do. Use <code>allowedActions</code> and <code>blockedActions</code> to make permissions
        explicit so external agents can read them from the passport page.
      </p>
      <CodeBlock label="permission.json">{`{
  "agentId": "agent_xxx",
  "action": "access_data",
  "resource": "gmail.com",
  "scope": "read-only gmail access",
  "allowedActions": ["read labels", "summarize messages", "provide pricing metrics"],
  "blockedActions": ["send email", "delete messages", "schedule events"],
  "requiresApproval": true,
  "template": "access_data",
  "constraints": {
    "allowedVendors": ["gmail.com"],
    "expiresAt": "2099-05-01T23:59:59Z"
  }
}`}</CodeBlock>
      <h2>Manual passport tests</h2>
      <p>
        Passport routes use a separate tokenized link. Send the <code>bhf_pass_</code> token as a bearer token;
        generated UI links keep it in the URL fragment. Passport links intentionally expose the agent&apos;s allowed
        permission scopes so external agents can read what they are permitted to do. They cannot create permissions,
        rotate keys, read logs, or expose API keys, webhook secrets, developer identity, or internal IDs.
      </p>
      <p>
        A passport token is not an API key. It only allows viewing the scoped passport and running manual preview
        checks for one agent. Treat it like a secret — anyone with the token can view the allowed scopes.
      </p>
      <div className="endpoint-list">
        {passportEndpoints.map(([method, path, body]) => (
          <div className="endpoint-card" key={path}>
            <span>{method}</span>
            <code>{path}</code>
            <p>{body}</p>
          </div>
        ))}
      </div>
      <CodeBlock label="curl">{`curl -X POST "$BASE_URL/api/verify" \\
  -H "Authorization: Bearer $BEHALFID_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"agent_xxx","action":"access_data","resource":"gmail.com"}'`}</CodeBlock>
      <h2>Action Gateway</h2>
      <p>
        <code>POST /api/actions/execute</code> uses the same agent API key pattern as verify.
        The MVP only executes <code>browse_web</code> on <code>web</code> by fetching a public URL with GET.
        Unsupported or denied actions fail closed and are not executed.
      </p>
      <CodeBlock label="gateway.json">{`{
  "agentId": "agent_xxx",
  "action": "browse_web",
  "resource": "web",
  "input": {
    "url": "https://example.com"
  }
}`}</CodeBlock>
    </DocsShell>
  );
}
