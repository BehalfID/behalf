import { CodeBlock, DocsShell } from "../content";

export default function QuickstartPage() {
  return (
    <DocsShell
      title="Quickstart"
      description="Test with an existing agent in manual mode, or enforce permissions from your own app with the SDK."
      previous={{ href: "/docs", label: "Overview" }}
      next={{ href: "/docs/api", label: "API reference" }}
    >
      <h2>Path A: test with an existing agent</h2>
      <ol className="docs-steps">
        <li><strong>Create account.</strong> Sign up at <code>/signup</code> and open the developer dashboard.</li>
        <li><strong>Add existing agent.</strong> Open <code>/dashboard/onboarding</code> and choose <code>I use an existing agent</code>.</li>
        <li><strong>Create first permission.</strong> Choose a template such as <code>access_data</code> on <code>gmail.com</code>, or use the purchase template for transaction limits.</li>
        <li><strong>Open passport link.</strong> The passport page shows the agent&apos;s allowed scopes, a machine-readable JSON passport, and a manual allow/deny preview form.</li>
        <li><strong>Copy instructions.</strong> Paste the generated instructions into Ollie, ChatGPT, Claude, or another assistant. The instructions direct the agent to open the passport link, read the Allowed scopes section, and ask you to verify before acting.</li>
        <li><strong>Understand the limitation.</strong> Manual mode does not control the provider directly; automatic enforcement requires API integration.</li>
      </ol>
      <h2>Path B: enforce in your app</h2>
      <ol className="docs-steps">
        <li><strong>Create native agent.</strong> Choose <code>I’m building my own agent</code> and store the one-time API key.</li>
        <li><strong>Create permission.</strong> Define the action, resource, scope, and constraints your app can enforce.</li>
        <li><strong>Install SDK.</strong> Add the published Node SDK to your app.</li>
        <li><strong>Call verify before action.</strong> If BehalfID denies the action, your app should not proceed.</li>
      </ol>
      <CodeBlock label="terminal">{`npm install @behalfid/sdk`}</CodeBlock>
      <CodeBlock label="verify.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.vercel.app"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "access_data",
  vendor: "gmail.com"
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
