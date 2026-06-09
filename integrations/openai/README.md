# OpenAI Compatibility Adapter

**Status: EXPERIMENTAL**

This is a compatibility adapter — not an official OpenAI integration or plugin. It wraps OpenAI-style tool/function calls with BehalfID permission checks before execution.

No OpenAI SDK is required. The adapter works with any object that has `{ name: string; arguments: Record<string, unknown> }` — which is the shape OpenAI's API returns for tool calls.

## Installation

```bash
npm install @behalfid/sdk
```

## Setup

```typescript
import { BehalfID } from "@behalfid/sdk";
import { checkToolCall, checkPurchase, checkWebBrowse } from "./integrations/openai";

const config = {
  client: new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! }),
  agentId: process.env.BEHALFID_AGENT_ID!,
};
```

## Usage

### Gate any tool call

```typescript
// toolCall comes from the OpenAI API response (message.tool_calls[i])
const result = await checkToolCall(config, toolCall, async () => {
  return await myHandlers[toolCall.name](JSON.parse(toolCall.function.arguments));
});

if (result.blocked) {
  // Return an error tool_result so the model can adapt
  return { role: "tool", tool_call_id: toolCall.id, content: result.reason };
}

return { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result.result) };
```

### Gate web browsing

Maps to `action: "browse_web"` with `resource` set to the target hostname.

```typescript
const result = await checkWebBrowse(config, url, async () => fetch(url).then(r => r.text()));
if (result.blocked) return { error: result.reason };
```

### Gate a purchase

Passes `amount` and `vendor` to BehalfID so `maxAmount` and `allowedVendors` constraints are enforced before any charge occurs.

```typescript
const result = await checkPurchase(config, {
  vendor: "stripe.com",
  amount: 4999,       // in your currency's minor unit or whole dollars — match your permission
  execute: async () => stripe.checkout.sessions.create({ ... }),
});
if (result.blocked) throw new Error(`Payment blocked: ${result.reason}`);
return result.result;
```

## Response shape

All functions return a `GatedResult<T>`:

```typescript
if (result.blocked === true) {
  result.reason    // string — why it was denied
  result.risk      // "low" | "medium" | "high"
  result.requestId // string — BehalfID audit log ID
}

if (result.blocked === false) {
  result.result    // T — return value of execute()
  result.requestId // string — BehalfID audit log ID
}
```

## What still needs to happen for an official OpenAI integration

- Published in the OpenAI plugin / GPT action registry
- Co-designed API contract reviewed by OpenAI
- Dedicated `@behalfid/openai` package on npm
