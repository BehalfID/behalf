# @behalfid/sdk

JavaScript SDK for BehalfID. Requires Node.js 18+.

## Install

```bash
npm install @behalfid/sdk
```

## Verify An Action

```js
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY,
  baseUrl: "https://behalfid.vercel.app"
});

const result = await behalf.verify({
  agentId: "agent_xxx",
  action: "purchase",
  amount: 742,
  vendor: "coachella.com"
});

if (result.allowed) {
  // proceed
} else {
  console.log(result.reason);
}
```

## Methods

- `verify(input)`
- `createAgent(name)`
- `createPermission(input)`
- `rotateKey(agentId)`
- `getLogs(agentId)`
- `verifyWebhookSignature(input)`

`createAgent` uses the configured `apiKey` as a bearer token. When public agent creation is disabled, pass a server-side `BEHALFID_SETUP_TOKEN` as the SDK `apiKey` for provisioning.

Do not log API keys. Created and rotated API keys are returned once by the BehalfID API.

## Verify Webhooks

```js
import { verifyWebhookSignature } from "@behalfid/sdk";

const valid = await verifyWebhookSignature({
  secret: process.env.BEHALFID_WEBHOOK_SECRET,
  payload: rawBody,
  timestamp: req.headers["behalfid-timestamp"],
  signature: req.headers["behalfid-signature"]
});
```

Use the raw request body exactly as received. The helper derives the same signing key BehalfID uses from the one-time `whsec_` secret. BehalfID webhook delivery is at least once, so receivers should deduplicate by event ID. Do not log webhook secrets.
