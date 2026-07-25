import Link from "next/link";
import { CodeBlock as SharedCodeBlock } from "@/components/ui";
import { DocsCallout } from "@/components/docs/DocsCallout";

function CodeBlock({ children, label }: { children: string; label?: string }) {
  return <SharedCodeBlock className="docs-code" label={label}>{children}</SharedCodeBlock>;
}

/** Shared SDK quickstart body for EN and locale routes. */
export function QuickstartDocsBody() {
  return (
    <>
      <DocsCallout tone="tip" title="Coding agents">
        <p>
          Using Claude Code, Codex, or Cursor? The faster path is the{" "}
          <Link href="/docs/cli">CLI &amp; MCP setup</Link> — it wires BehalfID into your coding agent
          without SDK code. This page covers the SDK path for custom Node.js integrations.
        </p>
      </DocsCallout>

      <h2>The five-minute model</h2>
      <p>
        BehalfID sits between the AI agent and the tool it wants to run. Your code calls
        BehalfID first. If the decision is not allowed, the executor does not run.
      </p>
      <ol className="docs-steps">
        <li><strong>Create an agent.</strong> Use <code>/dashboard/onboarding</code> or <code>behalf agents create</code>. Store the one-time <code>bhf_sk_...</code> API key as <code>BEHALFID_API_KEY</code>.</li>
        <li><strong>Create a permission.</strong> Start with one clear rule — for a coding agent: <code>deploy</code> on <code>vercel.com</code> with <code>requiresApproval: true</code> for production. For other agents: <code>browse_web</code> on <code>web</code>, or <code>purchase</code> on <code>amazon.com</code> with <code>maxAmount: 25</code>.</li>
        <li><strong>Install the SDK.</strong> Add the published Node SDK to the app that owns the tool execution.</li>
        <li><strong>Call verify before the action.</strong> The SDK requires <code>agentId</code>, <code>action</code>, and the API key. Pass <code>vendor</code> or <code>resource</code> when a permission is scoped to a service.</li>
        <li><strong>Show an allowed request.</strong> Call <code>verify</code> with an action and resource covered by an active permission.</li>
        <li><strong>Show a denied or approval-required request.</strong> Try a blocked action, a missing permission, or a permission with <code>requiresApproval: true</code>.</li>
        <li><strong>Fail closed.</strong> Throw or return before the executor. Never run the tool when <code>decision.allowed</code> is false.</li>
      </ol>

      <CodeBlock label="terminal">{`npm install @behalfid/sdk`}</CodeBlock>

      <h2>Copy-paste executor pattern</h2>
      <CodeBlock label="deploy.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
});

const agentId = process.env.BEHALFID_AGENT_ID!;

async function deployToProduction(vendor: string) {
  const decision = await behalf.verify({
    agentId,
    action: "deploy_production",
    vendor,
  });

  if (!decision.allowed) {
    // Blocked or approval required — reason and requestId are logged
    throw new Error(\`Blocked by BehalfID: \${decision.reason}\`);
  }

  return runDeploy({ vendor, env: "production" });
}`}</CodeBlock>

      <h2>Allowed request</h2>
      <p>
        This succeeds when the agent has an active <code>deploy</code> permission
        for <code>vercel.com</code> without a blocking rule or approval requirement.
      </p>
      <CodeBlock label="allowed.ts">{`const decision = await behalf.verify({
  agentId: process.env.BEHALFID_AGENT_ID!,
  action: "deploy",
  vendor: "vercel.com",
});

if (decision.allowed) {
  await runStagingDeploy();
}`}</CodeBlock>
      <CodeBlock label="allowed response">{`{
  "requestId": "req_xxx",
  "allowed": true,
  "reason": "Action allowed by active permission.",
  "risk": "low"
}`}</CodeBlock>

      <h2>Approval-required request</h2>
      <p>
        When a permission has <code>requiresApproval: true</code>, BehalfID returns{" "}
        <code>allowed: false</code> with a reason that signals human approval is needed.
        The agent should pause and surface the <code>requestId</code>. After you approve
        in the dashboard, the agent retries and the action is allowed.
      </p>
      <CodeBlock label="approval-required.ts">{`const decision = await behalf.verify({
  agentId: process.env.BEHALFID_AGENT_ID!,
  action: "deploy_production",
  vendor: "vercel.com",
});

if (!decision.allowed) {
  // Surface this to the engineer — do not auto-retry
  throw new Error(\`BehalfID: \${decision.reason} (ref: \${decision.requestId})\`);
}`}</CodeBlock>
      <CodeBlock label="approval-required response">{`{
  "requestId": "req_xxx",
  "allowed": false,
  "reason": "Permission requires approval before execution.",
  "risk": "medium"
}`}</CodeBlock>

      <h2>Denied request</h2>
      <p>
        This fails closed when a permission is missing, the vendor does not
        match, or a <code>blockedAction</code> covers the requested action.
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

      <DocsCallout tone="warn" title="Unexpected denials">
        <p>
          Match the exact <code>reason</code> string in{" "}
          <Link href="/docs/troubleshooting#verify-failures">Troubleshooting → verify failures</Link>.
          Run <code>behalf doctor</code> if auth or connectivity looks wrong.
        </p>
      </DocsCallout>

      <h2>Create permission with the SDK</h2>
      <CodeBlock label="permission.ts">{`await behalf.createPermission({
  agentId: process.env.BEHALFID_AGENT_ID!,
  action: "deploy_production",
  resource: "vercel.com",
  allowedActions: ["promote staging to production"],
  blockedActions: ["rollback without approval", "delete deployment"],
  requiresApproval: true,
});`}</CodeBlock>

      <h2>Manual mode vs enforcement</h2>
      <p>
        Passport links and manual preview forms help existing assistants understand
        the rules, but they do not control a provider directly. Automatic enforcement
        happens when your app, MCP server, or Action Gateway calls BehalfID before
        the action and refuses to run denied tools.
      </p>
      <p>
        For a runnable end-to-end version of this loop, use <code>examples/enforcement-demo</code>.
        It creates demo permissions, runs allowed and denied actions, and checks the resulting
        audit log entries.
      </p>
    </>
  );
}
