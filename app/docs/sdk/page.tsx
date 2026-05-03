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
      <h2>Verify an action</h2>
      <CodeBlock label="verify.ts">{`const result = await behalf.verify({
  agentId,
  action: "purchase",
  amount: 742,
  vendor: "coachella.com"
});`}</CodeBlock>
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
