import { CodeBlock, DocsShell } from "../content";

export default function WebhookDocsPage() {
  return (
    <DocsShell
      title="Webhooks"
      description="Subscribe to verification, agent, and permission events. BehalfID signs each event and delivers through a durable outbox."
      previous={{ href: "/docs/sdk", label: "JavaScript SDK" }}
      next={{ href: "/docs/concepts", label: "Concepts" }}
    >
      <h2>Event types</h2>
      <div className="docs-chip-grid">
        {["verification.allowed", "verification.denied", "agent.created", "agent.disabled", "agent.enabled", "agent.key_rotated", "permission.created", "permission.revoked"].map((event) => <code key={event}>{event}</code>)}
      </div>
      <h2>Headers</h2>
      <ul className="docs-list">
        <li><code>BehalfID-Event-ID</code> contains the stable event ID for deduplication.</li>
        <li><code>BehalfID-Timestamp</code> is included in the HMAC base string.</li>
        <li><code>BehalfID-Signature</code> is formatted as <code>v1=&lt;hex_hmac&gt;</code>.</li>
      </ul>
      <h2>Retries, DLQ, and replay</h2>
      <p>Webhook events are queued before delivery. Failed deliveries retry with bounded exponential backoff, then move to a dead-letter state where they can be inspected and replayed from the dashboard.</p>
      <p>Delivery is at least once. Receivers should deduplicate by event ID and make side effects idempotent.</p>
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
