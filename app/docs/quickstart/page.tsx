import { CodeBlock, DocsShell } from "../content";

export default function QuickstartPage() {
  return (
    <DocsShell title="Quickstart">
      <ol className="docs-steps">
        <li>Create a developer account at `/signup`.</li>
        <li>Create an agent in `/dashboard/agents` and store the one-time API key.</li>
        <li>Create a permission for an action such as `purchase`.</li>
        <li>Install the SDK.</li>
        <li>Call `verify()` before the agent acts.</li>
      </ol>
      <CodeBlock>{`npm install @behalfid/sdk`}</CodeBlock>
      <CodeBlock>{`const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "purchase",
  amount: 742,
  vendor: "coachella.com"
});`}</CodeBlock>
    </DocsShell>
  );
}
