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
    "action": "purchase",
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

Verify against the exact raw JSON body received by your server.

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
npm --prefix packages/sdk run build
npm --prefix examples/webhook-receiver install
BEHALFID_WEBHOOK_SECRET=whsec_xxx npm --prefix examples/webhook-receiver start
```

Create a local webhook endpoint pointing to:

```txt
http://localhost:4000
```

Local `http://localhost` URLs are allowed only in development. Production webhook URLs must use `https://`.

## Limitations

- One delivery attempt per event.
- No retries yet.
- Delivery happens asynchronously and does not block the core API response.
- Production SSRF protection rejects obvious localhost and private IP hosts, but DNS rebinding and complex network edge cases need stronger infrastructure controls before broad public use.
