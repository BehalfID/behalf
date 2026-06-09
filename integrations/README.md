# BehalfID Integration Adapters

Compatibility adapters for common AI frameworks and infrastructure. These are **not official partnerships** — they are helper wrappers that let you add BehalfID permission checks to existing agent workflows without changing framework-level code.

## Status

| Integration | Status | What it provides |
|---|---|---|
| OpenAI | Experimental | Tool call gate, web browse gate, purchase gate |
| Anthropic / Claude | Experimental | Tool-use gate, denied tool_result helper |
| LangChain | Experimental | `wrapToolWithBehalfID`, `wrapToolsWithBehalfID` |
| LlamaIndex | Experimental | `wrapLlamaToolWithBehalfID` for FunctionTool |
| Vercel | Deployment example | Next.js App Router API route with fail-closed verify |
| Stripe | Permission example | Gates for checkout, charge, subscription change, refund |

None of these adapters are certified or co-developed with the respective vendors. "Experimental" means the API is functional but may change as official integrations are pursued.

## How they work

Each adapter follows the same pattern:

1. Receive a tool call / action intent from an AI model
2. Call `BehalfID.verify({ agentId, action, amount?, vendor? })`
3. If allowed → invoke the real tool and return the result
4. If denied → return a `DenyResponse` and skip the tool entirely

The underlying tool is **never called** when permission is denied.

## Installation

```bash
npm install @behalfid/sdk
```

```typescript
import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,   // bhf_sk_...
});

const config = {
  client: behalf,
  agentId: process.env.BEHALFID_AGENT_ID!,
};
```

## Adapters

- [shared/](./shared/README.md) — shared types and utilities used by all adapters
- [openai/](./openai/README.md) — OpenAI-style tool call wrapper
- [anthropic/](./anthropic/README.md) — Claude tool-use wrapper
- [langchain/](./langchain/README.md) — LangChain tool wrapper
- [llamaindex/](./llamaindex/README.md) — LlamaIndex FunctionTool wrapper
- [vercel/](./vercel/README.md) — Vercel deployment guide and example route
- [stripe/](./stripe/README.md) — Stripe permission gate examples

## What's needed for official integrations

To move from "experimental adapter" to "official integration" with each vendor:

- **OpenAI** — published in OpenAI's plugin / GPT action registry; co-designed API contract
- **Anthropic** — listed in Anthropic's partner ecosystem; reviewed integration guide
- **LangChain** — merged PR into `langchain-ai/langchainjs`; published `@langchain/behalfid`
- **LlamaIndex** — merged PR into `run-llama/LlamaIndex.TS`; published `llamaindex-behalfid`
- **Vercel** — listed in Vercel Marketplace; integration review completed
- **Stripe** — listed in Stripe App Marketplace; reviewed payment flow
