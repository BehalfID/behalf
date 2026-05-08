import { CodeBlock, DocsShell } from "../content";

export default function QuickstartPage() {
  return (
    <DocsShell
      title="Quickstart"
      description="Test with an existing agent in manual mode, or enforce permissions from your own app with the SDK."
      previous={{ href: "/docs", label: "Overview" }}
      next={{ href: "/docs/site-guard", label: "Site Guard" }}
    >
      <h2>Path A: test with an existing agent</h2>
      <ol className="docs-steps">
        <li><strong>Create account.</strong> Sign up at <code>/signup</code> and open the developer dashboard.</li>
        <li><strong>Add existing agent.</strong> Open <code>/dashboard/onboarding</code> and choose <code>I use an existing agent</code>.</li>
        <li><strong>Create first permission.</strong> Choose a template. For <code>access_data</code> on <code>gmail.com</code>: set allowed actions to <code>read labels, summarize messages</code> and blocked actions to <code>send email, delete email</code>. For purchase on <code>coachella.com</code>: set max amount to <code>800</code>. Agent descriptions are informational; permissions are the source of truth.</li>
        <li><strong>Open passport link.</strong> The passport page shows the agent&apos;s allowed scopes, copyable agent memory block, machine-readable JSON, and a manual preview form.</li>
        <li><strong>Copy instructions.</strong> Paste the generated instructions into Ollie, ChatGPT, Claude, or another assistant. The instructions direct the agent to open the passport link, read the Allowed scopes section, and ask you to verify before acting.</li>
        <li><strong>Agents that cannot fetch passport links.</strong> Passport links use a <code>#token=…</code> URL fragment. Agents like Gemini memory, ChatGPT system prompts, or Claude project instructions do not execute JavaScript and cannot retrieve the scoped data. For these agents, the passport page provides two copyable blocks: the <strong>Agent memory block</strong> (paste into the agent&apos;s memory or system prompt — best-effort, some assistants compress or ignore saved memory) and the <strong>Per-task permission prompt</strong> (paste directly into the active chat where the agent is about to act — more reliable because it is in the active context window, not stored state).</li>
        <li><strong>Understand the limitation.</strong> Manual mode does not control the provider directly, and it relies on agent cooperation. Automatic enforcement requires API integration.</li>
      </ol>
      <h2>Path B: enforce in your app (fail closed)</h2>
      <ol className="docs-steps">
        <li><strong>Create native agent.</strong> Choose <code>I&apos;m building my own agent</code> and store the one-time API key.</li>
        <li><strong>Create permission.</strong> Choose a scope template or define a custom action with allowed actions, blocked actions, and constraints.</li>
        <li><strong>Install SDK.</strong> Add the published Node SDK to your app.</li>
        <li><strong>Call verify before action.</strong> Use <code>enforceAction</code> to fail closed — denied actions throw before reaching the code that would execute the action.</li>
      </ol>
      <CodeBlock label="terminal">{`npm install @behalfid/sdk`}</CodeBlock>
      <CodeBlock label="enforce.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.com"
});

async function enforceAction(input) {
  const result = await behalf.verify({ agentId: "agent_xxx", ...input });
  if (!result.allowed) {
    throw new Error(\`Action blocked by BehalfID: \${result.reason}\`);
  }
  return result;
}

// browse_web is allowed — continues.
await enforceAction({ action: "browse_web", vendor: "web" });

// purchase is denied — throws. Next line never runs.
await enforceAction({ action: "purchase", vendor: "coachella.com", amount: 742 });
console.log("Booking ticket..."); // ← never reached`}</CodeBlock>
      <CodeBlock label="denied response">{`{
  "requestId": "req_xxx",
  "allowed": false,
  "reason": "No active permission exists for this action.",
  "risk": "high"
}`}</CodeBlock>
      <h2>Scope templates</h2>
      <p>The dashboard and SDK ship with scope templates for common categories. Each template prefills the action, resource, allowed actions, and blocked actions — edit before saving.</p>
      <CodeBlock label="scope examples">{`// Data access
{ action: "access_data", vendor: "gmail.com",
  allowedActions: ["read labels", "summarize messages"],
  blockedActions: ["send email", "delete messages"] }

// Browse web
{ action: "browse_web", vendor: "web",
  allowedActions: ["search web", "read public pages"],
  blockedActions: ["submit forms", "make purchases"] }

// Purchase with constraints
{ action: "purchase", vendor: "coachella.com",
  constraints: { maxAmount: 800, allowedVendors: ["coachella.com"] } }

// Schedule
{ action: "schedule", vendor: "calendar.google.com",
  allowedActions: ["create events", "send invites"],
  blockedActions: ["delete events", "create recurring events"] }`}</CodeBlock>
    </DocsShell>
  );
}
