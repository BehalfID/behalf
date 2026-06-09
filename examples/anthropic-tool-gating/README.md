# Claude Tool-Use Gating

Shows how to insert BehalfID permission checks into a Claude tool-use loop. The Anthropic API response is stubbed — no Anthropic API key required.

## What it demonstrates

- `checkToolUse()` gates each `tool_use` block before the handler runs
- `buildDeniedToolResult()` formats denial into a `tool_result` the model understands
- The model receives a structured error when blocked — it can adapt its response
- `tool_use_id` is always echoed so results can be matched back to the model

## Setup

```bash
cp .env.example .env
# Edit .env with your BehalfID API key and agent ID
```

## Run

```bash
npx tsx index.ts
```

## Expected output

```
[TOOL USE] id=toolu_01 name=send_email
[VERIFY]   action=send_email agentId=agent_xxx
[ALLOW]    requestId=req_abc result= { sent: true, messageId: 'msg_abc123' }

[TOOL USE] id=toolu_02 name=delete_file
[VERIFY]   action=delete_file agentId=agent_xxx
[DENY]     reason=No active permission exists for this action. risk=high
[TOOL RESULT SENT TO MODEL] { type: 'tool_result', is_error: true, ... }

[SUMMARY] tool results ready to send back to model: 2 items
```

## Plugging in a real Anthropic client

```typescript
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const message = await anthropic.messages.create({
  model: "claude-opus-4-5",
  max_tokens: 1024,
  tools: [/* your tool definitions */],
  messages: [{ role: "user", content: "..." }],
});

for (const block of message.content) {
  if (block.type !== "tool_use") continue;
  const gated = await checkToolUse(integrationConfig, block, async () => {
    return handlers[block.name]?.(block.input);
  });
  // ... handle gated.blocked / gated.result
}
```

## Deny scenario

Delete or revoke the `send_email` permission from the BehalfID dashboard. Both tool calls will return `is_error: true` results to the model.
