# BehalfID Webhooks

Webhooks send signed BehalfID events to your server when agent and permission activity happens.

## Event Types

```txt
verification.allowed
verification.denied
agent.created
agent.disabled
agent.enabled
agent.key_rotated
permission.created
permission.revoked
```

## Create An Endpoint

Use `/console/webhooks` to create an endpoint. BehalfID generates a signing secret once:

```txt
whsec_xxx
```

Store it in your receiver environment. BehalfID stores only a derived hash and a short preview, so the full secret cannot be viewed again. Rotating the secret immediately stops the previous secret from working.

## Payload

```json
{
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
}
```

Webhook payloads do not include API keys, setup tokens, webhook secrets, or rotated keys.

## Headers

```txt
BehalfID-Event-ID: evt_xxx
BehalfID-Timestamp: unix_timestamp
BehalfID-Signature: v1=<hex_hmac>
```

The signature covers:

```txt
timestamp.rawBody
```

Verify against the exact raw JSON body received by your server. BehalfID stores only a SHA-256 derived signing key for the one-time `whsec_` secret; the SDK derives the same key locally before verification.

## Verify With The SDK

```js
import { verifyWebhookSignature } from "@behalfid/sdk";

const valid = await verifyWebhookSignature({
  secret: process.env.BEHALFID_WEBHOOK_SECRET,
  payload: rawBody,
  timestamp: req.headers["behalfid-timestamp"],
  signature: req.headers["behalfid-signature"]
});
```

## Local Testing

Run the example receiver:

```bash
npm --prefix examples/webhook-receiver install
BEHALFID_WEBHOOK_SECRET=whsec_xxx npm --prefix examples/webhook-receiver start
```

Create a local webhook endpoint pointing to:

```txt
http://localhost:4000
```

Local `http://localhost` URLs are allowed only in development. Production webhook URLs must use `https://`.

Trigger a verification event, then process the queued event:

```bash
curl -s http://localhost:3000/api/webhooks/process \
  -H "Authorization: Bearer $BEHALFID_SETUP_TOKEN" | jq
```

Expected receiver output:

```txt
Received verification.allowed (evt_xxx)
```

For hosted deployments, configure a Vercel cron or external scheduler to call `/api/webhooks/process` regularly with the setup token or an authenticated console session.

## Delivery Guarantees

BehalfID writes every webhook event to a `WebhookEvent` outbox before returning from the API action that generated it. Delivery is processed later by `/api/webhooks/process`, so webhook endpoint failures do not block core API responses after the event is safely queued.

Delivery is at least once. Receivers should deduplicate by `BehalfID-Event-ID` or the payload `eventId`.

Retry schedule:

```txt
attempt 1 -> immediate
attempt 2 -> +5 seconds
attempt 3 -> +30 seconds
attempt 4 -> +2 minutes
attempt 5 -> +10 minutes
```

If any subscribed endpoint fails, the event remains pending until the next retry. Once all subscribed endpoints succeed, the event is marked `completed` and `completedAt` is set. After five attempts, it is marked `failed` with `deadLetter=true` and the sanitized `lastError`.

Recent event status is visible in `/console/webhook-events`, and endpoint delivery attempts are visible on each webhook detail page.

## Dead Letters And Replay

The dead-letter queue is every webhook event where:

```txt
deadLetter = true
```

Use `/console/webhook-events` to filter failed or dead-lettered events by status or event type. Open an event detail page to inspect the payload, delivery attempts, HTTP statuses, sanitized errors, and retry timing.

After fixing the receiver, use the replay button on the event detail page. Only failed dead-letter events can be replayed. Replay resets the event to:

```txt
status = pending
attempts = 0
nextAttemptAt = now
deadLetter = false
lastError = null
```

Events currently in `processing`, `pending`, or `completed` cannot be replayed. Replay is a console-authenticated mutation and uses the same Origin checks as other console writes.

## Limitations

- Retries are capped at five attempts.
- The worker is a simple API route for Vercel cron or external schedulers, not a dedicated queue service.
- Delivery is at least once, not exactly once.
- API actions and outbox writes are not wrapped in MongoDB transactions yet; a future version should make that atomic for stricter guarantees.
- Production SSRF protection rejects obvious localhost and private IP hosts, but DNS rebinding and complex network edge cases need stronger infrastructure controls before broad public use.
