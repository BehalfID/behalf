import { CodeBlock, DocsShell } from "../content";

const endpoints = [
  ["POST", "/api/agents", "Create an agent and return the API key once."],
  ["POST", "/api/permissions", "Create a permission for the authenticated agent."],
  ["POST", "/api/verify", "Evaluate whether an agent can perform an action."],
  ["GET", "/api/logs/[agentId]", "Read recent verification logs for the authenticated agent."],
  ["POST", "/api/agents/[agentId]/rotate-key", "Rotate an agent API key and return the new key once."]
];

export default function ApiDocsPage() {
  return (
    <DocsShell
      title="API reference"
      description="Agent API keys use Authorization: Bearer bhf_sk_xxx. Dashboard routes use developer session cookies."
      previous={{ href: "/docs/quickstart", label: "Quickstart" }}
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
      <CodeBlock>{`curl -X POST "$BASE_URL/api/verify" \\
  -H "Authorization: Bearer $BEHALFID_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"agent_xxx","action":"purchase","amount":742,"vendor":"coachella.com"}'`}</CodeBlock>
    </DocsShell>
  );
}
