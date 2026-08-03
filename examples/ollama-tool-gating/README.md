# Ollama Tool-Call Gating

Shows how to insert BehalfID permission checks into an Ollama chat tool-call loop. The example stubs the model response so no local Ollama instance is required.

## What it demonstrates

- `parseOllamaToolCalls()` normalizes Ollama `message.tool_calls` (object or JSON-string arguments)
- `checkToolCall()` gates each tool call before the handler runs
- Allowed calls: `execute()` runs and the result is returned
- Denied calls: the handler is never called; `buildDeniedToolMessage()` can be fed back to the model
- Network failure: verify() throws → the call is blocked automatically (fail-closed)

## Setup

Required env vars:

| Variable | Description |
|---|---|
| `BEHALFID_API_KEY` | Agent key from the BehalfID dashboard (`bhf_sk_...`) |
| `BEHALFID_AGENT_ID` | Agent identifier from the dashboard |

Create the agent with `provider: "ollama"` if you want it labeled as a local-model agent.

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
[FEEDBACK] { role: 'tool', content: 'Permission denied by BehalfID: ...' }
```

The `buy_item` call is blocked because no permission exists for that action. Create a permission in the BehalfID dashboard and re-run to see the allow path.

## Plugging in a real Ollama client

Replace the stubbed message with a fetch to your local Ollama server:

```typescript
const res = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: process.env.OLLAMA_MODEL ?? "llama3.1",
    stream: false,
    tools: [/* your tool schemas */],
    messages,
  }),
});

const data = await res.json();
const toolCalls = parseOllamaToolCalls(data.message?.tool_calls);

for (const toolCall of toolCalls) {
  const gated = await checkToolCall(integrationConfig, toolCall, async () => { /* ... */ });
  // ... handle gated.blocked / gated.result
}
```

See also: `integrations/ollama/README.md` and `docs/OLLAMA.md`.
