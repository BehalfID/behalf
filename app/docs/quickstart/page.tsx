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
        <li><strong>Create first permission.</strong> Use action <code>purchase</code>, vendor <code>coachella.com</code>, max amount <code>800</code>, and a two-hour expiration.</li>
        <li><strong>Open passport link.</strong> Use the tokenized public-safe passport page to test allow and deny decisions.</li>
        <li><strong>Copy instructions.</strong> Paste the generated instructions into Ollie, ChatGPT, Claude, or another assistant.</li>
        <li><strong>Understand the limitation.</strong> Manual mode does not control the provider directly; automatic enforcement requires API integration.</li>
      </ol>
      <h2>Path B: enforce in your app</h2>
      <ol className="docs-steps">
        <li><strong>Create native agent.</strong> Choose <code>I’m building my own agent</code> and store the one-time API key.</li>
        <li><strong>Create permission.</strong> Define the action, vendor, amount, and expiration constraints.</li>
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
