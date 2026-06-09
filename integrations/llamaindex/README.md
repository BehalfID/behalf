# LlamaIndex Compatibility Adapter

**Status: EXPERIMENTAL**

This is a compatibility adapter — not an official LlamaIndex integration. It wraps LlamaIndex `FunctionTool`-compatible objects with a BehalfID permission check before execution. The wrapper preserves `metadata` (name, description, and JSON schema parameters) so it can be registered with a `ReActAgent` or other LlamaIndex agent executor without modification.

No LlamaIndex package is imported by this adapter. It uses a minimal duck-typed interface compatible with `FunctionTool` and `QueryEngineTool`.

## Installation

```bash
npm install @behalfid/sdk llamaindex
```

## Setup

```typescript
import { BehalfID } from "@behalfid/sdk";
import { wrapLlamaToolWithBehalfID } from "./integrations/llamaindex";

const config = {
  client: new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! }),
  agentId: process.env.BEHALFID_AGENT_ID!,
};
```

## Usage

### Wrap a FunctionTool

```typescript
import { FunctionTool } from "llamaindex";

const purchaseTool = FunctionTool.from(
  async ({ amount, vendor }: { amount: number; vendor: string }) => {
    const receipt = await paymentApi.charge({ amount, vendor });
    return JSON.stringify(receipt);
  },
  {
    name: "purchaseItem",
    description: "Purchase an item from a vendor.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number",  description: "Amount in cents." },
        vendor: { type: "string",  description: "Vendor domain." },
      },
      required: ["amount", "vendor"],
    },
  }
);

const safeTool = wrapLlamaToolWithBehalfID(config, purchaseTool, {
  amount: 500,
  vendor: "amazon.com",
});

// Register with agent as normal — metadata is preserved
const agent = new ReActAgent({ tools: [safeTool], llm });
```

### Denied result

When BehalfID denies the action, `call()` returns a `DenyResponse` and the underlying tool is not invoked:

```typescript
{
  blocked: true,
  reason: "No active permission exists for this action.",
  risk: "high",
  requestId: "req_abc123",
}
```

## What still needs to happen for an official LlamaIndex integration

- Merged PR into `run-llama/LlamaIndex.TS` repo
- Published `@llamaindex/behalfid` package on npm
- Integration listed on LlamaIndex documentation / integrations page
