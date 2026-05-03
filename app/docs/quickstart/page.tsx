import { CodeBlock, DocsShell } from "../content";

export default function QuickstartPage() {
  return (
    <DocsShell
      title="Quickstart"
      description="Verify a constrained ticket purchase with the dashboard, an agent API key, and the JavaScript SDK."
      previous={{ href: "/docs", label: "Overview" }}
      next={{ href: "/docs/api", label: "API reference" }}
    >
      <ol className="docs-steps">
        <li><strong>Create account.</strong> Sign up at <code>/signup</code> and open the developer dashboard.</li>
        <li><strong>Create agent.</strong> Go to <code>/dashboard/agents</code>, create an agent, and store the one-time API key.</li>
        <li><strong>Create permission.</strong> Add action <code>purchase</code>, vendor <code>coachella.com</code>, and max amount <code>800</code>.</li>
        <li><strong>Install SDK.</strong> Add the published Node SDK to your app.</li>
        <li><strong>Verify action.</strong> Call <code>verify()</code> before the agent acts.</li>
        <li><strong>View logs.</strong> Confirm the decision in <code>/dashboard/logs</code>.</li>
      </ol>
      <CodeBlock label="terminal">{`npm install @behalfid/sdk`}</CodeBlock>
      <CodeBlock label="verify.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.vercel.app"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "purchase",
  amount: 742,
  vendor: "coachella.com"
});`}</CodeBlock>
      <CodeBlock label="response">{`{
  "requestId": "req_xxx",
  "allowed": true,
  "reason": "Action allowed by active permission.",
  "risk": "low"
}`}</CodeBlock>
    </DocsShell>
  );
}
