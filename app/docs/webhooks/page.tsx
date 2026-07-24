import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, DocsCallout, DocsShell } from "../content";

export const metadata: Metadata = {
  title: "Webhooks — BehalfID",
  description: "Subscribe to verification, agent, and permission events. BehalfID signs each event and delivers through a durable outbox with retries.",
  alternates: { canonical: "/docs/webhooks" }
};

export default function WebhookDocsPage() {
  return (
    <DocsShell
      title="Webhooks"
      description="Subscribe to verification, agent, and permission events. BehalfID signs each event and delivers through a durable outbox."
      previous={{ href: "/docs/action-gateway", label: "Action Gateway" }}
      next={{ href: "/docs/site-guard", label: "Site Guard" }}
    >
      <h2>What webhooks are for</h2>
      <p>
        Webhooks push signed events to your HTTPS endpoint when agents, permissions, or
        verification decisions change. Use them to sync SIEM tools, open tickets on denials,
        pause CI when production deploy approval is required, or mirror audit activity into
        your own store.
      </p>
      <p>
        Events are written to an outbox before the API response returns. Delivery runs
        asynchronously via <code>/api/webhooks/process</code>, so a down receiver does not
        block <code>verify()</code> or permission mutations.
      </p>

      <DocsCallout tone="warn" title="Delivery not arriving?">
        <p>
          Check signature verification against the raw body, redirects (not followed), dead-letter
          state, and plan entitlements. Step-by-step:{" "}
          <Link href="/docs/troubleshooting#webhooks">Troubleshooting → webhooks</Link>.
        </p>
      </DocsCallout>

      <h2>Event types</h2>
      <div className="docs-chip-grid">
        {[
          "verification.allowed",
          "verification.denied",
          "agent.created",
          "agent.disabled",
          "agent.enabled",
          "agent.key_rotated",
          "permission.created",
          "permission.revoked"
        ].map((event) => (
          <code key={event}>{event}</code>
        ))}
      </div>
      <p>
        Subscribe to a subset when you create the endpoint in the{" "}
        <Link href="/dashboard/webhooks">dashboard webhooks</Link> page. Only subscribed
        types are delivered.
      </p>

      <h2>Create an endpoint</h2>
      <ol className="docs-steps">
        <li>Open <Link href="/dashboard/webhooks">Dashboard → Webhooks</Link> and add an HTTPS URL.</li>
        <li>Select the event types you want to receive.</li>
        <li>
          Copy the one-time signing secret (<code>whsec_…</code>). BehalfID stores only a
          derived hash and a short preview — the full secret cannot be viewed again.
        </li>
        <li>
          Store the secret as <code>BEHALFID_WEBHOOK_SECRET</code> (or equivalent) in your
          receiver environment.
        </li>
      </ol>
      <p>
        Production URLs must use <code>https://</code>. Local <code>http://localhost</code>{" "}
        endpoints are allowed only in development. Rotating the secret immediately stops the
        previous secret from verifying new deliveries.
      </p>

      <h2>Payload</h2>
      <CodeBlock label="event.json">{`{
  "eventId": "evt_xxx",
  "type": "verification.allowed",
  "createdAt": "2026-05-02T00:00:00.000Z",
  "accountId": "acct_xxx",
  "data": {
    "requestId": "req_xxx",
    "agentId": "agent_xxx",
    "action": "access_data",
    "allowed": true,
    "risk": "low",
    "permissionId": "perm_xxx"
  }
}`}</CodeBlock>
      <p>
        Payloads never include API keys, setup tokens, webhook secrets, or newly rotated
        agent keys. Treat <code>eventId</code> as the dedupe key.
      </p>

      <h2>Headers</h2>
      <ul className="docs-list">
        <li><code>BehalfID-Event-ID</code> — stable event ID (same as payload <code>eventId</code>).</li>
        <li><code>BehalfID-Timestamp</code> — Unix seconds included in the HMAC base string.</li>
        <li><code>BehalfID-Signature</code> — <code>v1=&lt;hex_hmac&gt;</code> over <code>timestamp.rawBody</code>.</li>
      </ul>
      <p>
        Verify against the exact raw JSON body your server received. Do not re-serialize
        parsed JSON before checking the signature — whitespace and key order must match.
      </p>

      <h2>Verify with the SDK</h2>
      <CodeBlock label="receiver.ts">{`import { verifyWebhookSignature } from "@behalfid/sdk";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const valid = await verifyWebhookSignature({
    secret: process.env.BEHALFID_WEBHOOK_SECRET!,
    payload: rawBody,
    timestamp: request.headers.get("behalfid-timestamp") ?? undefined,
    signature: request.headers.get("behalfid-signature") ?? undefined
  });

  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody) as { eventId: string; type: string };
  // Deduplicate by event.eventId, then handle side effects idempotently.
  return new Response("ok");
}`}</CodeBlock>
      <p>
        The helper rejects timestamps outside a 300-second skew window by default
        (<code>toleranceSeconds</code>). If your deployment sets{" "}
        <code>BEHALFID_WEBHOOK_SIGNING_PEPPER</code>, pass the same value as{" "}
        <code>signingPepper</code> to the SDK helper.
      </p>

      <h2>Retries, DLQ, and replay</h2>
      <p>
        Delivery is at least once. Failed deliveries retry with bounded exponential backoff,
        then move to a dead-letter state:
      </p>
      <CodeBlock label="retry schedule">{`attempt 1 → immediate
attempt 2 → +5 seconds
attempt 3 → +30 seconds
attempt 4 → +2 minutes
attempt 5 → +10 minutes
(after 5 failures → deadLetter = true)`}</CodeBlock>
      <p>
        Inspect failed events and delivery attempts from the webhook detail page in the
        dashboard. After fixing the receiver, replay a dead-lettered event — replay resets
        status to pending, clears <code>lastError</code>, and sets attempts back to zero.
        Events that are still pending, processing, or completed cannot be replayed.
      </p>

      <h2>Local testing</h2>
      <CodeBlock label="terminal">{`npm --prefix examples/webhook-receiver install
BEHALFID_WEBHOOK_SECRET=whsec_xxx npm --prefix examples/webhook-receiver start`}</CodeBlock>
      <p>
        Point a development endpoint at <code>http://localhost:4000</code>, trigger a
        verification, then process the outbox (hosted deployments usually schedule{" "}
        <code>/api/webhooks/process</code> via cron). See also the{" "}
        <Link href="/docs/sdk">SDK</Link> webhook helper and the{" "}
        <Link href="/docs/concepts">Concepts</Link> page for how verification decisions
        relate to these events.
      </p>
    </DocsShell>
  );
}
