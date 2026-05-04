import { CodeBlock, DocsShell } from "../content";

export default function SdkDocsPage() {
  return (
    <DocsShell
      title="JavaScript SDK"
      description="The SDK is published as @behalfid/sdk and uses fetch, so it works in Node 18+ without extra dependencies."
      previous={{ href: "/docs/api", label: "API reference" }}
      next={{ href: "/docs/webhooks", label: "Webhooks" }}
    >
      <h2>Install</h2>
      <CodeBlock label="terminal">{`npm install @behalfid/sdk`}</CodeBlock>
      <h2>Initialize</h2>
      <CodeBlock label="client.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.vercel.app"
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
        explicit so external agents can read them from the passport page.
      </p>
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
        Pass <code>metadata.scope</code> to hint which allowed action is being requested.
      </p>
      <h2>Logs and key rotation</h2>
      <CodeBlock label="keys-and-logs.ts">{`const logs = await behalf.getLogs(agentId);
const rotated = await behalf.rotateKey(agentId);`}</CodeBlock>
      <h2>Webhook signature helper</h2>
      <CodeBlock label="webhook.ts">{`import { verifyWebhookSignature } from "@behalfid/sdk";

const valid = await verifyWebhookSignature({
  secret: process.env.BEHALFID_WEBHOOK_SECRET!,
  payload: rawBody,
  timestamp: req.headers["behalfid-timestamp"],
  signature: req.headers["behalfid-signature"]
});`}</CodeBlock>
    </DocsShell>
  );
}
