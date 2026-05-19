import { CodeBlock, DocsShell } from "../content";

export default function QuickstartPage() {
  return (
    <DocsShell
      title="Quickstart"
      description="Create an agent, add one permission, verify before execution, and prove both allowed and denied actions in about five minutes."
      previous={{ href: "/docs", label: "Overview" }}
      next={{ href: "/docs/cli", label: "CLI" }}
    >
      <h2>The five-minute model</h2>
      <p>
        BehalfID sits between the AI agent and the tool it wants to run. Your code asks
        BehalfID first. If the decision is not allowed, the executor does not run.
      </p>
      <ol className="docs-steps">
        <li><strong>Create an agent.</strong> Use <code>/dashboard/onboarding</code> or <code>behalf agents create</code>. Store the one-time <code>bhf_sk_...</code> API key as <code>BEHALFID_API_KEY</code>.</li>
        <li><strong>Create a permission.</strong> Start with one clear rule, such as <code>browse_web</code> on <code>web</code>, <code>read_calendar</code> on <code>google-calendar</code>, or <code>purchase</code> on <code>amazon.com</code> with <code>maxAmount: 25</code>.</li>
        <li><strong>Install the SDK.</strong> Add the published Node SDK to the app that owns the tool execution.</li>
        <li><strong>Call verify before the action.</strong> The SDK requires <code>agentId</code>, <code>action</code>, and the API key. Pass <code>vendor</code> or <code>resource</code> when a permission is scoped to a service.</li>
        <li><strong>Show an allowed request.</strong> Call <code>verify</code> with an action and resource covered by an active permission.</li>
        <li><strong>Show a denied request.</strong> Try a blocked action, a missing permission, a missing constrained vendor/resource, or an amount over the limit.</li>
        <li><strong>Fail closed.</strong> Throw or return before the executor. Never run the tool when <code>decision.allowed</code> is false.</li>
      </ol>

      <CodeBlock label="terminal">{`npm install @behalfid/sdk`}</CodeBlock>

      <h2>Copy-paste executor pattern</h2>
      <CodeBlock label="purchase.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
});

const agentId = process.env.BEHALFID_AGENT_ID!;

async function purchase(vendor: string, amount: number) {
  const decision = await behalf.verify({
    agentId,
    action: "purchase",
    vendor,
    amount,
  });

  if (!decision.allowed) {
    throw new Error(\`Blocked by BehalfID: \${decision.reason}\`);
  }

  return runPurchase({ vendor, amount });
}`}</CodeBlock>

      <h2>Allowed request</h2>
      <p>
        This succeeds when the agent has an active <code>browse_web</code> permission
        for <code>web</code> and no matching blocked action.
      </p>
      <CodeBlock label="allowed.ts">{`const decision = await behalf.verify({
  agentId: process.env.BEHALFID_AGENT_ID!,
  action: "browse_web",
  resource: "web",
});

if (decision.allowed) {
  await runBrowserRead("https://example.com");
}`}</CodeBlock>
      <CodeBlock label="allowed response">{`{
  "requestId": "req_xxx",
  "allowed": true,
  "reason": "Action allowed by active permission.",
  "risk": "low"
}`}</CodeBlock>

      <h2>Denied request</h2>
      <p>
        This fails closed when the purchase permission is missing, the vendor does not
        match, <code>blockedActions</code> includes <code>purchase</code>, approval is
        required, or the amount exceeds the permission limit.
      </p>
      <CodeBlock label="denied.ts">{`const decision = await behalf.verify({
  agentId: process.env.BEHALFID_AGENT_ID!,
  action: "purchase",
  vendor: "shop.example",
  amount: 742,
});

if (!decision.allowed) {
  throw new Error(\`Blocked by BehalfID: \${decision.reason}\`);
}

await runCheckout(); // not reached when denied`}</CodeBlock>
      <CodeBlock label="denied response">{`{
  "requestId": "req_xxx",
  "allowed": false,
  "reason": "Amount exceeds maxAmount constraint.",
  "risk": "high"
}`}</CodeBlock>

      <h2>Create permission with the SDK</h2>
      <CodeBlock label="permission.ts">{`await behalf.createPermission({
  agentId: process.env.BEHALFID_AGENT_ID!,
  action: "purchase",
  resource: "shop.example",
  allowedActions: ["purchase"],
  blockedActions: ["checkout without approval"],
  requiresApproval: false,
  constraints: {
    maxAmount: 25,
    allowedVendors: ["shop.example"],
  },
});`}</CodeBlock>

      <h2>Manual mode vs enforcement</h2>
      <p>
        Passport links and manual preview forms help existing assistants understand
        the rules, but they do not control a provider directly. Automatic enforcement
        happens when your app, MCP server, or Action Gateway calls BehalfID before
        the action and refuses to run denied tools.
      </p>
    </DocsShell>
  );
}
