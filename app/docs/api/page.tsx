import { CodeBlock, DocsShell } from "../content";

export default function ApiDocsPage() {
  return (
    <DocsShell title="API reference">
      <p>Agent API keys use `Authorization: Bearer bhf_sk_xxx`. Dashboard routes use developer session cookies.</p>
      <ul className="docs-list">
        <li>`POST /api/agents` creates an agent.</li>
        <li>`POST /api/permissions` creates a permission.</li>
        <li>`POST /api/verify` checks an action.</li>
        <li>`GET /api/logs/[agentId]` reads recent logs.</li>
        <li>`POST /api/agents/[agentId]/rotate-key` rotates a key.</li>
        <li>`GET /api/webhooks/process` processes queued webhook events.</li>
      </ul>
      <CodeBlock>{`curl -X POST "$BASE_URL/api/verify" \\
  -H "Authorization: Bearer $BEHALFID_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"agent_xxx","action":"purchase","amount":742,"vendor":"coachella.com"}'`}</CodeBlock>
    </DocsShell>
  );
}
