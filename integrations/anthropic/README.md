# Anthropic / Claude Compatibility Adapter

**Status: EXPERIMENTAL**

This is a compatibility adapter — not an official Anthropic integration. It wraps Claude tool_use blocks with BehalfID permission checks before your handler executes. The denied response format matches Anthropic's `tool_result` shape so it can be forwarded to the API without extra transformation.

No Anthropic SDK is required. The adapter works with the raw `tool_use` content blocks returned by the Claude API.

## Installation

```bash
npm install @behalfid/sdk
```

## Setup

```typescript
import { BehalfID } from "@behalfid/sdk";
import { checkToolUse, buildDeniedToolResult } from "./integrations/anthropic";

const config = {
  client: new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! }),
  agentId: process.env.BEHALFID_AGENT_ID!,
};
```

## Usage

### Gate tool_use blocks in a message loop

```typescript
const toolResults = [];

for (const block of message.content) {
  if (block.type !== "tool_use") continue;

  const gated = await checkToolUse(config, block, async () => {
    return await handlers[block.name](block.input);
  });

  if (gated.blocked) {
    // Tell the model the action was blocked so it can adapt its response.
    toolResults.push(buildDeniedToolResult(gated.tool_use_id, gated.reason));
  } else {
    toolResults.push({
      type: "tool_result",
      tool_use_id: gated.tool_use_id,
      content: JSON.stringify(gated.result),
    });
  }
}

// Continue the conversation with tool results
const next = await anthropic.messages.create({
  model: "claude-opus-4-7-20251101",
  messages: [
    ...messages,
    { role: "assistant", content: message.content },
    { role: "user",      content: toolResults },
  ],
  tools,
  max_tokens: 1024,
});
```

### With verify overrides (amount, vendor)

```typescript
const gated = await checkToolUse(
  config,
  block,
  async () => stripe.checkout.sessions.create({ ... }),
  { amount: 4999, vendor: "stripe.com" }
);
```

## Response shape

```typescript
// gated.tool_use_id is always present (echoes block.id)
if (gated.blocked === true) {
  gated.reason    // why it was denied
  gated.risk      // "low" | "medium" | "high"
  gated.requestId // BehalfID audit log ID
}

if (gated.blocked === false) {
  gated.result    // return value of execute()
  gated.requestId // BehalfID audit log ID
}
```

## What still needs to happen for an official Anthropic integration

- Listed in Anthropic's partner ecosystem
- Reviewed integration guide published by Anthropic
- Dedicated `@behalfid/anthropic` package on npm
