# LangChain Compatibility Adapter

**Status: EXPERIMENTAL**

This is a compatibility adapter — not an official LangChain integration. It wraps LangChain-compatible tools with a BehalfID permission check so the underlying tool is never invoked when an action is denied.

No LangChain package is imported by this adapter. It uses a minimal duck-typed interface (`name`, `description`, `call`) that is compatible with LangChain's `DynamicTool`, `StructuredTool`, and `Tool` classes.

## Installation

```bash
npm install @behalfid/sdk langchain @langchain/openai
```

## Setup

```typescript
import { BehalfID } from "@behalfid/sdk";
import { wrapToolWithBehalfID, wrapToolsWithBehalfID } from "./integrations/langchain";

const config = {
  client: new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! }),
  agentId: process.env.BEHALFID_AGENT_ID!,
};
```

## Usage

### Wrap a single tool

```typescript
import { DynamicTool } from "@langchain/core/tools";

const purchaseTicketTool = new DynamicTool({
  name: "purchaseTicket",
  description: "Purchase a ticket for a given event ID.",
  func: async (eventId: string) => {
    const ticket = await ticketingApi.purchase(eventId);
    return JSON.stringify(ticket);
  },
});

// Replace the raw tool with the wrapped version
const safePurchaseTool = wrapToolWithBehalfID(config, purchaseTicketTool, {
  amount: 250,
  vendor: "ticketmaster.com",
});

const executor = await initializeAgentExecutorWithOptions(
  [safePurchaseTool],   // drop-in replacement
  llm,
  { agentType: "openai-functions" }
);
```

### Wrap a send email tool

```typescript
const sendEmailTool = new DynamicTool({
  name: "sendEmail",
  description: "Send an email to a recipient.",
  func: async (input: string) => {
    const { to, subject, body } = JSON.parse(input);
    return await mailer.send({ to, subject, body });
  },
});

const safeSendEmailTool = wrapToolWithBehalfID(config, sendEmailTool);
```

### Wrap multiple tools at once

```typescript
const safeTools = wrapToolsWithBehalfID(config, [
  sendEmailTool,
  purchaseTicketTool,
  browseWebTool,
]);

const executor = await initializeAgentExecutorWithOptions(safeTools, llm, {
  agentType: "openai-functions",
});
```

## Denied result

When BehalfID denies an action, `call()` returns a `DenyResponse` instead of calling the underlying tool:

```typescript
{
  blocked: true,
  reason: "Amount exceeds maxAmount constraint.",
  risk: "high",
  requestId: "req_abc123",
}
```

LangChain will receive this as the tool's return value. Your agent's LLM will see the denial reason and can adapt its response.

## What still needs to happen for an official LangChain integration

- Merged PR into `langchain-ai/langchainjs` repo
- Published `@langchain/behalfid` package on npm
- Integration listed on LangChain hub / integrations page
