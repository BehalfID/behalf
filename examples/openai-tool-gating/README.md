# OpenAI Tool-Call Gating

Shows how to insert BehalfID permission checks into an OpenAI-style agent tool-call loop. The example stubs the model response so no OpenAI API key is needed.

## What it demonstrates

- `checkToolCall()` gates each tool call before the handler runs
- Allowed calls: `execute()` runs and the result is returned
- Denied calls: the handler is never called; the deny reason can be fed back to the model
- Network failure: verify() throws → the call is blocked automatically (fail-closed)

## Setup

```bash
cp .env.example .env
# Edit .env with your BehalfID API key and agent ID
```

Required env vars:

| Variable | Description |
|---|---|
| `BEHALFID_API_KEY` | Agent key from the BehalfID dashboard (`bhf_sk_...`) |
| `BEHALFID_AGENT_ID` | Agent identifier from the dashboard |

## Run

```bash
npx tsx index.ts
```

## Expected output

```
[VERIFY] action=search_web agentId=agent_xxx
[ALLOW]  requestId=req_abc running tool search_web
[RESULT] { results: ['BehalfID docs page'] }

[VERIFY] action=buy_item agentId=agent_xxx
[DENY]   reason=No active permission exists for this action. risk=high
```

The `buy_item` call is blocked because no permission exists for that action. Create a permission in the BehalfID dashboard and re-run to see the allow path.

## Deny scenario

Remove or revoke the permission for `search_web` in the dashboard, then re-run. Both tool calls will be blocked and execute() will never be called.

## Allow scenario

Create permissions for both `search_web` and `buy_item` in the BehalfID dashboard. Both tool calls will execute and return results.

## Plugging in a real OpenAI client

Replace the `stubbedToolCalls` array with:

```typescript
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const completion = await openai.chat.completions.create({ ... });
const toolCalls = completion.choices[0].message.tool_calls ?? [];

for (const tc of toolCalls) {
  const toolCall = { name: tc.function.name, arguments: JSON.parse(tc.function.arguments) };
  const gated = await checkToolCall(integrationConfig, toolCall, async () => { ... });
  // ... handle gated.blocked / gated.result
}
```
