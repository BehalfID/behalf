import type { Metadata } from "next";
import { CodeBlock, DocsCallout, DocsShell } from "../content";

export const metadata: Metadata = {
  title: "JavaScript SDK — BehalfID",
  description: "Install @behalfid/sdk and call behalf.verify() before tool execution from Node 18+. Uses fetch with no extra dependencies.",
  alternates: { canonical: "/docs/sdk" }
};

export default function SdkDocsPage() {
  return (
    <DocsShell
      title="JavaScript SDK"
      description="The SDK is published as @behalfid/sdk and uses fetch, so it works in Node 18+ without extra dependencies."
      previous={{ href: "/docs/api", label: "API reference" }}
      next={{ href: "/docs/action-gateway", label: "Action Gateway" }}
    >
      <h2>Install</h2>
      <CodeBlock label="terminal">{`npm install @behalfid/sdk`}</CodeBlock>
      <p>
        The package is published on{" "}
        <a href="https://www.npmjs.com/package/@behalfid/sdk" target="_blank" rel="noopener noreferrer">npm as @behalfid/sdk</a>.
      </p>
      <h2>Initialize</h2>
      <CodeBlock label="client.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.com"
});`}</CodeBlock>
      <h2>Add a connected agent</h2>
      <CodeBlock label="connected-agent.ts">{`const agent = await behalf.createAgent({
  name: "Ollie",
  agentType: "connected",
  provider: "ollie",
  externalAgentLabel: "Jasper's Ollie assistant",
  description: "Personal assistant used for planning"
});`}</CodeBlock>
      <h2>Create a permission with structured scopes</h2>
      <CodeBlock label="permission.ts">{`await behalf.createPermission({
  agentId,
  action: "access_data",
  resource: "gmail.com",
  allowedActions: ["read labels", "summarize messages", "provide pricing metrics"],
  blockedActions: ["send email", "delete messages", "schedule events", "make purchases"],
  requiresApproval: true,
  template: "access_data"
});`}</CodeBlock>
      <p>
        Agent descriptions are informational. Permissions are the source of truth.
        Use <code>allowedActions</code> and <code>blockedActions</code> to make the permission
        explicit so external agents can read them from the passport page. Active blocked
        actions override allows, and non-empty allowed actions narrow the permission to those
        exact action strings.
      </p>
      <h2>Fail-closed enforcement</h2>
      <p>
        Gate every external action with <code>verify</code>. On denial, throw or return before
        calling the executor. This is fail closed: verify first, execute second, and stop when
        permission is missing, approval is required, constraints are missing, or a check fails.
      </p>
      <DocsCallout tone="danger" title="Fail closed">
        <p>
          Map unexpected <code>reason</code> values in{" "}
          <a href="/docs/troubleshooting#verify-failures">Troubleshooting</a>. Never treat network
          or verify errors as allow.
        </p>
      </DocsCallout>
      <CodeBlock label="enforce.ts">{`async function enforceAction(input) {
  const result = await behalf.verify({ agentId, ...input });
  if (!result.allowed) {
    throw new Error(\`Action blocked by BehalfID: \${result.reason}\`);
  }
  return result;
}

// Allowed — proceeds.
await enforceAction({ action: "browse_web", vendor: "web" });

// Denied — throws. The next line never runs.
await enforceAction({ action: "purchase", vendor: "coachella.com", amount: 742 });
console.log("Booking ticket..."); // ← never reached`}</CodeBlock>
      <h2>Verify an action</h2>
      <CodeBlock label="verify.ts">{`const result = await behalf.verify({
  agentId,
  action: "access_data",
  vendor: "gmail.com",
  metadata: {
    scope: "read labels"
  }
});`}</CodeBlock>
      <p>
        In the current API, <code>vendor</code> can represent the resource or service
        being accessed. Pass <code>amount</code> only for transaction-like actions.
        Pass the exact action string you want to execute. If the permission has
        <code> allowedActions</code>, that action must appear in the list; a broad parent
        action does not bypass the narrowed scope.
      </p>
      <h2>Execute through the Action Gateway</h2>
      <p>
        <code>executeAction</code> routes execution through BehalfID-controlled infrastructure.
        The MVP supports only safe public web reads: <code>browse_web</code> on <code>web</code>.
        Denied actions return <code>executed: false</code> and no fetch happens.
      </p>
      <CodeBlock label="gateway.ts">{`const result = await behalf.executeAction({
  agentId,
  action: "browse_web",
  resource: "web",
  input: {
    url: "https://example.com"
  }
});

if (result.executed) {
  console.log(result.result?.title, result.result?.excerpt);
}`}</CodeBlock>
      <h2>Logs and key rotation</h2>
      <CodeBlock label="keys-and-logs.ts">{`const logs = await behalf.getLogs(agentId);
const rotated = await behalf.rotateKey(agentId);`}</CodeBlock>
      <p>
        <code>rotateKey</code> immediately invalidates the previous agent API key. Store the
        new key from the response — it is returned once. Permissions and agent ID are
        unchanged.
      </p>

      <h2>Edge cases to handle</h2>
      <ul className="docs-list">
        <li>
          <strong>Approval required.</strong> <code>allowed</code> is false and{" "}
          <code>reason</code> indicates approval is needed. Surface <code>requestId</code> to
          a human; do not auto-retry in a tight loop. See{" "}
          <a href="/docs/deploy-approvals">Deploy approvals</a>.
        </li>
        <li>
          <strong>Blocked actions override allows.</strong> If any active permission lists the
          action under <code>blockedActions</code>, verify denies even when another permission
          would allow it.
        </li>
        <li>
          <strong>Allowed-actions narrowing.</strong> A non-empty <code>allowedActions</code>{" "}
          list requires the exact action string you pass to <code>verify</code>. A broad parent
          action does not satisfy a narrowed list.
        </li>
        <li>
          <strong>Missing constrained inputs.</strong> When a permission has vendor, resource,
          or amount constraints, omit those fields and the decision fails closed rather than
          bypassing the constraint.
        </li>
        <li>
          <strong>Network / 5xx from BehalfID.</strong> Treat unavailable checks as deny in
          production executors. Do not fail open.
        </li>
      </ul>

      <h2>Webhook signature helper</h2>
      <p>
        Receivers must verify HMAC signatures before trusting payload contents. Full delivery
        semantics are documented under <a href="/docs/webhooks">Webhooks</a>.
      </p>
      <CodeBlock label="webhook.ts">{`import { verifyWebhookSignature } from "@behalfid/sdk";

const valid = await verifyWebhookSignature({
  secret: process.env.BEHALFID_WEBHOOK_SECRET!,
  payload: rawBody,
  timestamp: req.headers["behalfid-timestamp"],
  signature: req.headers["behalfid-signature"]
});`}</CodeBlock>

      <h2>Related docs</h2>
      <ul className="docs-list">
        <li><a href="/docs/quickstart">SDK Quickstart</a> — five-minute allowed/denied loop</li>
        <li><a href="/docs/action-gateway">Action Gateway</a> — let BehalfID execute safe public web reads</li>
        <li><a href="/docs/api">API reference</a> — REST equivalents for every SDK call</li>
        <li><a href="/docs/concepts">Concepts</a> — passports, fail-closed, Managed Profiles</li>
      </ul>
    </DocsShell>
  );
}
