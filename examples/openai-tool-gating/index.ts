/**
 * OpenAI tool-call gating — runnable example.
 *
 * Demonstrates BehalfID gating in front of an OpenAI-style tool call loop.
 * No real OpenAI API key is required — the model response is stubbed so you
 * can observe the allow and deny paths without spending API credits.
 *
 * Swap the stub out for a real openai.chat.completions.create() call once you
 * have verified the gating logic works for your use case.
 *
 * Run:
 *   cp .env.example .env   # fill in your keys
 *   npx tsx index.ts
 *
 * Expected output (allow scenario):
 *   [VERIFY] action=search_web agentId=<your-agent-id>
 *   [ALLOW]  requestId=req_... running tool search_web
 *   [RESULT] { results: ['BehalfID docs page'] }
 *
 * Expected output (deny scenario):
 *   [VERIFY] action=buy_item agentId=<your-agent-id>
 *   [DENY]   reason=No active permission exists for this action. risk=high
 */

import { config as loadEnv } from "dotenv";
import { BehalfID } from "@behalfid/sdk";
import { checkToolCall } from "../../integrations/openai/index.js";

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

// ─── Stub model response (normally from openai.chat.completions.create) ───────

const stubbedToolCalls = [
  { name: "search_web", arguments: { query: "behalfid docs" } },
  { name: "buy_item",   arguments: { item: "laptop", price: 999 } },
];

// ─── Tool call loop ───────────────────────────────────────────────────────────

async function main() {
  for (const toolCall of stubbedToolCalls) {
    console.log(`\n[VERIFY] action=${toolCall.name} agentId=${integrationConfig.agentId}`);

    const gated = await checkToolCall(
      integrationConfig,
      toolCall,
      async () => {
        if (toolCall.name === "search_web") return searchWeb(toolCall.arguments as { query: string });
        if (toolCall.name === "buy_item")   return buyItem(toolCall.arguments as { item: string; price: number });
        return null;
      }
    );

    if (gated.blocked) {
      console.log(`[DENY]   reason=${gated.reason} risk=${gated.risk}`);
      // Feed gated.reason back to the model as a tool error so it can adapt.
      continue;
    }

    console.log(`[ALLOW]  requestId=${gated.requestId} running tool ${toolCall.name}`);
    console.log(`[RESULT]`, gated.result);
  }
}

main().catch(console.error);
