# LangChain Tool Wrapper

Shows how `wrapToolWithBehalfID()` and `wrapToolsWithBehalfID()` act as drop-in replacements for LangChain tools. No LangChain package is required to run the example — the tool shape is implemented directly via duck typing.

## What it demonstrates

- `wrapToolWithBehalfID()` preserves `name` and `description` for agent registration
- `wrapToolsWithBehalfID()` wraps an array of tools in one call
- Denied calls: `call()` returns a `DenyResponse` instead of the tool output
- Allowed calls: `call()` delegates to the original tool and returns its output unchanged

## Setup

```bash
cp .env.example .env
```

## Run

```bash
npx tsx index.ts
```

## Expected output

```
=== purchaseTicket ===
[HANDLER] purchaseTicket called with: event_123
[ALLOW] purchaseTicket result: ticket_abc123

=== sendEmail ===
[HANDLER] sendEmail called with: user@example.com
[ALLOW] sendEmail result: email_sent
```

Create permissions for `purchaseTicket` and `sendEmail` in the BehalfID dashboard. Remove them to see the deny path.

## Using with a real LangChain agent

```typescript
import { DynamicTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";

const purchaseTool = new DynamicTool({
  name: "purchaseTicket",
  description: "Purchase a ticket for an event.",
  func: async (input) => purchaseTicket(input),
});

// Drop-in replacement — same registration, BehalfID gates every call
const safeTool = wrapToolWithBehalfID(integrationConfig, purchaseTool, {
  amount: 250,
  vendor: "ticketmaster.com",
});

const agent = await createOpenAIFunctionsAgent({ llm, tools: [safeTool], prompt });
const executor = new AgentExecutor({ agent, tools: [safeTool] });
```

## Note on DenyResponse in LangChain

When a tool call is denied, `call()` returns a `DenyResponse` object rather than a string. LangChain's `DynamicTool` will serialize this to JSON and pass it back to the model. The model can read the `reason` and `risk` fields and adapt its response. This is the correct behavior — the model needs to know that the action was blocked.
