# Compatibility & Integration Adapters

BehalfID provides compatibility adapters for common AI frameworks and infrastructure. These adapters let you add permission checks to existing agent workflows without modifying framework internals.

**Important:** These are compatibility helpers, not official partnerships. No adapter in this repo is co-developed, certified, or listed in any vendor's marketplace. See the status table and the per-adapter notes for exactly what is and isn't in place.

## Integration status

| Platform | Adapter status | Marketing claim you can make |
|---|---|---|
| OpenAI | Experimental adapter | "Compatible with OpenAI-style tool call workflows" |
| Anthropic / Claude | Experimental adapter | "Claude-ready" |
| LangChain | Experimental adapter | "Adapter for LangChain" |
| LlamaIndex | Experimental adapter | "Adapter for LlamaIndex" |
| Vercel | Deployment example | "Vercel deployable" |
| Stripe | Permission example | "Stripe permission check example" |

## How to use the adapters

All adapters follow the same three-step pattern:

1. Create a `BehalfID` client from `@behalfid/sdk`
2. Pass it in a config object to the adapter function
3. Wrap your tool call / action in an `execute` callback

```typescript
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! });

const config = {
  client: behalf,
  agentId: process.env.BEHALFID_AGENT_ID!,
};
```

### OpenAI-style tool calls

```typescript
import { checkToolCall } from "@/integrations/openai";

const result = await checkToolCall(config, toolCall, async () => {
  return await myHandler(toolCall.arguments);
});

if (result.blocked) return { error: result.reason };
return result.result;
```

Full reference: `integrations/openai/README.md`

### Claude tool-use

```typescript
import { checkToolUse, buildDeniedToolResult } from "@/integrations/anthropic";

const gated = await checkToolUse(config, block, async () => handlers[block.name](block.input));

if (gated.blocked) {
  toolResults.push(buildDeniedToolResult(gated.tool_use_id, gated.reason));
}
```

Full reference: `integrations/anthropic/README.md`

### LangChain tools

```typescript
import { wrapToolWithBehalfID } from "@/integrations/langchain";

const safeTool = wrapToolWithBehalfID(config, myLangChainTool);
// Register safeTool with your agent executor as a drop-in replacement.
```

Full reference: `integrations/langchain/README.md`

### LlamaIndex tools

```typescript
import { wrapLlamaToolWithBehalfID } from "@/integrations/llamaindex";

const safeTool = wrapLlamaToolWithBehalfID(config, myFunctionTool);
// Register safeTool with ReActAgent or other executor.
```

Full reference: `integrations/llamaindex/README.md`

### Vercel deployment

Set `BEHALFID_API_KEY` and `BEHALFID_AGENT_ID` in your Vercel project's environment variables. Copy `integrations/vercel/example-route.ts` to `app/api/agent-action/route.ts` and adapt the action handler.

Full reference: `integrations/vercel/README.md`

### Stripe permission gates

```typescript
import { gateCheckoutSession } from "@/integrations/stripe";

const gated = await gateCheckoutSession(config, {
  amountTotal: 4999,
  execute: async () => stripe.checkout.sessions.create({ ... }),
});

if (gated.blocked) throw new Error(gated.reason);
return gated.result;
```

Full reference: `integrations/stripe/README.md`

## Gated result shape

Every adapter returns a `GatedResult<T>` discriminated on `blocked`:

```typescript
if (result.blocked === true) {
  result.reason     // human-readable denial reason
  result.risk       // "low" | "medium" | "high"
  result.requestId  // BehalfID audit log ID
}

if (result.blocked === false) {
  result.result     // return value of your execute() callback
  result.requestId  // BehalfID audit log ID
}
```

When `blocked` is `true`, your `execute` callback was never called.

## Optional: verify() timeout

Pass `timeoutMs` in the config to enforce a deadline on the permission check.
If the check doesn't complete in time, the action is **denied** (fail-closed):

```typescript
const config = {
  client: behalf,
  agentId: process.env.BEHALFID_AGENT_ID!,
  timeoutMs: 3000, // deny if verify() takes more than 3 seconds
};
```

When the deadline fires, the in-flight verify request is also aborted via
`AbortController` (on runtimes whose `fetch` supports `AbortSignal`).

The `execute` callback is not subject to this timeout — wrap it separately if needed.

## Running the adapter tests

```bash
# Unit tests (fast, no network required)
npm test

# Export validation tests (verifies SDK dist files have correct exports)
npm test -- test/sdk-exports.test.ts

# Live tests against a real BehalfID instance (opt-in)
RUN_LIVE_TESTS=true npm run test:live

# Live tests targeting specific files
RUN_LIVE_TESTS=true npx vitest run test/integration/live-verify.test.ts test/integration/live-adapters.test.ts
```

### Required env vars for live tests

| Variable | Required | Description |
|---|---|---|
| `RUN_LIVE_TESTS` | Yes (`true`) | Gate — live tests skip if absent |
| `BEHALFID_BASE_URL` | Yes | URL of the BehalfID instance, e.g. `http://localhost:3000` |
| `BEHALFID_API_KEY` | Yes | Agent key (`bhf_sk_...`) |
| `BEHALFID_AGENT_ID` | Yes | Agent ID |
| `OPENAI_API_KEY` | Optional | Enables OpenAI SDK smoke test |
| `ANTHROPIC_API_KEY` | Optional | Enables Anthropic SDK smoke test |
| `STRIPE_SECRET_KEY` | Optional | Enables Stripe gating smoke test |

Values can be placed in `~/behalf/.env` — live tests load it automatically.

### Seeding the allowed-path permission

Allowed-path tests require a real permission on the test agent. Run before live tests:

```bash
npm run seed:live-test
```

What it creates:
- `action: "send"`, `resource: "communication.email"`
- Expires automatically in 1 hour
- Idempotent — safe to rerun if already exists

If seeding fails (dashboard or API unreachable), the script prints manual steps.

### Exact allowed-path permission for manual setup

If `npm run seed:live-test` fails, create this permission through the dashboard:

```
Agent:    <BEHALFID_AGENT_ID>
Action:   send
Resource: communication.email
Expiry:   (optional — 1 hour recommended)
```

### Known test permission (denied path — always blocked)

```
Action:   purchase
Resource: commerce.checkout
Amount:   999999
```

This is always denied unless the test agent has an explicit permission allowing a $999,999 purchase, which would be a misconfiguration.

### What live tests cover

| File | Denied paths | Allowed paths |
|---|---|---|
| `test/integration/live-verify.test.ts` | `purchase/999999`, bad key, response shape | `send/communication.email` after seed |
| `test/integration/live-adapters.test.ts` | All adapters: execute never called on deny | OpenAI, Anthropic, LangChain: execute called on allow |

### What live tests do NOT cover

- Allowed-path for Stripe (no seeded permission for `stripe:checkout`) — test the deny gate only
- LlamaIndex live (no live tests; unit tests cover the full logic)
- Vendor SDKs (openai, @anthropic-ai/sdk, stripe) are only invoked if keys present and packages installed
- No real charges, emails, or API calls to vendor APIs are made

## What needs to happen before claiming official integrations

### OpenAI
- Published in OpenAI's tool/plugin registry
- Co-designed API contract reviewed by OpenAI
- Dedicated npm package `@behalfid/openai`

### Anthropic
- Listed in Anthropic's partner ecosystem
- Integration guide reviewed and approved by Anthropic
- Dedicated npm package `@behalfid/anthropic`

### LangChain
- Merged PR in `langchain-ai/langchainjs`
- Published `@langchain/behalfid` on npm
- Listed on LangChain integrations page

### LlamaIndex
- Merged PR in `run-llama/LlamaIndex.TS`
- Published `@llamaindex/behalfid` on npm
- Listed on LlamaIndex integrations page

### Vercel
- Listed in Vercel Marketplace with a provisioning flow
- Integration review completed by Vercel partnerships

### Stripe
- Listed in Stripe App Marketplace
- Integration reviewed for SCA, webhooks, and idempotency compliance
- Dedicated npm package `@behalfid/stripe`

Until the above milestones are reached for each vendor, use the language in the "Marketing claim you can make" column of the status table above.
