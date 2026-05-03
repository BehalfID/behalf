import { CodeBlock, DocsShell } from "../content";

export default function SdkDocsPage() {
  return (
    <DocsShell title="JavaScript SDK">
      <CodeBlock>{`npm install @behalfid/sdk`}</CodeBlock>
      <CodeBlock>{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
  baseUrl: "https://behalfid.vercel.app"
});

await behalf.verify({ agentId, action: "purchase", amount: 742, vendor: "coachella.com" });
await behalf.getLogs(agentId);
await behalf.rotateKey(agentId);`}</CodeBlock>
    </DocsShell>
  );
}
