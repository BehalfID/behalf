/**
 * Ollama tool-call gating — runnable example.
 *
 * Demonstrates BehalfID gating in front of an Ollama-style tool call loop.
 * No live Ollama instance is required — the model response is stubbed so you
 * can observe the allow and deny paths without pulling a model.
 *
 * Swap the stub out for a real fetch to Ollama `/api/chat` once you have
 * verified the gating logic works for your use case.
 *
 * Run:
 *   set BEHALFID_API_KEY / BEHALFID_AGENT_ID in the environment
 *   npx tsx index.ts
 *
 * Expected output (allow scenario for search_web if permitted):
 *   [VERIFY] action=search_web agentId=<your-agent-id>
 *   [ALLOW]  requestId=req_... running tool search_web
 *   [RESULT] { results: ['BehalfID docs page'] }
 *
 * Expected output (deny scenario for buy_item without a permission):
 *   [VERIFY] action=buy_item agentId=<your-agent-id>
 *   [DENY]   reason=No active permission exists for this action. risk=high
 */

import { config as loadEnv } from "dotenv";
import { BehalfID } from "@behalfid/sdk";
import {
  parseOllamaToolCalls,
  checkToolCall,
  buildDeniedToolMessage,
} from "../../integrations/ollama/index.js";

loadEnv();

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! });

const integrationConfig = {
  client: behalf,
  agentId: process.env.BEHALFID_AGENT_ID!,
};

// ─── Stub tool handlers ───────────────────────────────────────────────────────

async function searchWeb(args: { query: string }) {
  return { results: ["BehalfID docs page"] };
}

async function buyItem(args: { item: string; price: number }) {
  return { orderId: "order_123" };
}

// ─── Stub Ollama message.tool_calls (normally from POST /api/chat) ────────────

const stubbedOllamaMessage = {
  role: "assistant",
  content: "",
  tool_calls: [
    {
      function: {
        name: "search_web",
        arguments: { query: "behalfid docs" },
      },
    },
    {
      function: {
        name: "buy_item",
        // Ollama sometimes returns arguments as a JSON string
        arguments: JSON.stringify({ item: "laptop", price: 999 }),
      },
    },
  ],
};

// ─── Tool call loop ───────────────────────────────────────────────────────────

async function main() {
  const toolCalls = parseOllamaToolCalls(stubbedOllamaMessage.tool_calls);

  for (const toolCall of toolCalls) {
    console.log(`\n[VERIFY] action=${toolCall.name} agentId=${integrationConfig.agentId}`);

    const gated = await checkToolCall(
      integrationConfig,
      toolCall,
      async () => {
        if (toolCall.name === "search_web") {
          return searchWeb(toolCall.arguments as { query: string });
        }
        if (toolCall.name === "buy_item") {
          return buyItem(toolCall.arguments as { item: string; price: number });
        }
        return null;
      }
    );

    if (gated.blocked) {
      console.log(`[DENY]   reason=${gated.reason} risk=${gated.risk}`);
      console.log(`[FEEDBACK]`, buildDeniedToolMessage(gated.reason));
      continue;
    }

    console.log(`[ALLOW]  requestId=${gated.requestId} running tool ${toolCall.name}`);
    console.log(`[RESULT]`, gated.result);
  }
}

main().catch(console.error);
