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
  action: "access_data",
  vendor: "gmail.com"
});

if (result.allowed) {
  // proceed
} else {
  console.log(result.reason);
}
```

## Methods

- `verify(input)`
- `createAgent(nameOrInput)`
- `createPermission(input)`
- `rotateKey(agentId)`
- `getLogs(agentId)`
- `verifyWebhookSignature(input)`

`createAgent` uses the configured `apiKey` as a bearer token. When public agent creation is disabled, pass a server-side `BEHALFID_SETUP_TOKEN` as the SDK `apiKey` for provisioning.

For non-transaction actions, the current API field `vendor` can represent the resource or service being accessed. Pass `amount` only when verifying purchase or transaction-like actions.

For connected agents, pass metadata instead of just a name:

```js
const agent = await behalf.createAgent({
  name: "Ollie",
  agentType: "connected",
  provider: "ollie",
  externalAgentLabel: "Jasper's Ollie assistant",
  description: "Personal assistant used for planning"
});
```

Connected-agent metadata is descriptive only. It does not authenticate with the external provider.

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
