# Ollama Compatibility Adapter

**Status: EXPERIMENTAL**

This is a compatibility adapter — not an official Ollama integration. It wraps Ollama chat `tool_calls` with BehalfID permission checks before execution.

No Ollama client library is required. Use `parseOllamaToolCalls()` on `message.tool_calls` from `/api/chat`, or pass any `{ name, arguments }` object to `checkToolCall()`.

This is separate from BehalfID's optional Ollama **permission drafting** (`docs/OLLAMA.md`). Drafting helps humans create permissions; this adapter gates tool execution for agents that already have an API key.

## Installation

```bash
npm install @behalfid/sdk
```

```typescript
import { BehalfID } from "@behalfid/sdk";
import {
  parseOllamaToolCalls,
  checkToolCall,
  buildDeniedToolMessage,
} from "@behalfid/sdk/adapters/ollama";

const config = {
  client: new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! }),
  agentId: process.env.BEHALFID_AGENT_ID!,
};
```

## Usage

### Gate tool calls from an Ollama chat response

```typescript
const toolCalls = parseOllamaToolCalls(message.tool_calls);

for (const toolCall of toolCalls) {
  const result = await checkToolCall(config, toolCall, async () => {
    return await myHandlers[toolCall.name](toolCall.arguments);
  });

  if (result.blocked) {
    messages.push(buildDeniedToolMessage(result.reason));
    continue;
  }

  messages.push({
    role: "tool",
    content: JSON.stringify(result.result),
  });
}
```

### Gate web browsing / purchases

Same helpers as the OpenAI adapter: `checkWebBrowse()` and `checkPurchase()`.

## Response shape

All gate functions return a `GatedResult<T>`:

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

## Example

See `examples/ollama-tool-gating` for a runnable stub loop (no live Ollama required).

For MCP tool servers in front of an Ollama-driven agent, wrap with `@behalfid/mcp-runtime` (source-only until published). See `docs/OLLAMA.md` (Ollama + MCP).

## Notes

- Create the agent with `provider: "ollama"` in the dashboard (or API) for clear labeling. Provider metadata is not used for auth.
- Optional Track B fields `ollamaBaseUrl` / `ollamaModel` plus dashboard test/chat proxy are developer convenience only — see `docs/OLLAMA.md`.
- Prefer models that support tool calling (for example `llama3.1`, `qwen2.5`).
- Fail-closed: if `verify()` errors or times out, the tool is not executed.
