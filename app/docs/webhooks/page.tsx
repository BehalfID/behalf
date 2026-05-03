import { CodeBlock, DocsShell } from "../content";

export default function WebhookDocsPage() {
  return (
    <DocsShell title="Webhooks">
      <p>Subscribe to verification, agent, and permission events. BehalfID signs each event and delivers through a durable outbox.</p>
      <ul className="docs-list">
        <li>Headers include `BehalfID-Event-ID`, `BehalfID-Timestamp`, and `BehalfID-Signature`.</li>
        <li>Delivery is at least once. Deduplicate by event ID.</li>
        <li>Failures retry five times, then move to dead letter.</li>
        <li>Replay dead-lettered events from the dashboard.</li>
      </ul>
      <CodeBlock>{`import { verifyWebhookSignature } from "@behalfid/sdk";

const valid = await verifyWebhookSignature({
  secret: process.env.BEHALFID_WEBHOOK_SECRET!,
  payload: rawBody,
  timestamp,
  signature
});`}</CodeBlock>
    </DocsShell>
  );
}
