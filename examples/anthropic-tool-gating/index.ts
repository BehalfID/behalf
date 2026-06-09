/**
 * Claude tool-use gating — runnable example.
 *
 * Demonstrates BehalfID gating inside a Claude tool-use loop. The model
 * response is stubbed; no Anthropic API key is required to run this example.
 *
 * In a real integration, replace the stubbed message with the response from
 * `client.messages.create(...)` and iterate over message.content blocks.
 *
 * Run:
 *   cp .env.example .env
 *   npx tsx index.ts
 *
 * Expected output (allow scenario):
 *   [TOOL USE] id=toolu_01 name=send_email
 *   [VERIFY]   action=send_email agentId=<your-agent-id>
 *   [ALLOW]    requestId=req_... result={ sent: true }
 *
 * Expected output (deny scenario):
 *   [TOOL USE] id=toolu_02 name=delete_file
 *   [VERIFY]   action=delete_file agentId=<your-agent-id>
 *   [DENY]     reason=No active permission exists for this action. risk=high
 *   [TOOL RESULT SENT TO MODEL] { type: 'tool_result', is_error: true, ... }
 */

import { config as loadEnv } from "dotenv";
import { BehalfID } from "@behalfid/sdk";
import { checkToolUse, buildDeniedToolResult } from "../../integrations/anthropic/index.js";

loadEnv();

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! });

const integrationConfig = {
  client: behalf,
  agentId: process.env.BEHALFID_AGENT_ID!,
};

// ─── Stub handlers ────────────────────────────────────────────────────────────

async function sendEmail(input: { to: string; subject: string }) {
  return { sent: true, messageId: "msg_abc123" };
}

async function deleteFile(input: { path: string }) {
  return { deleted: true };
}

const handlers: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {
  send_email: sendEmail as (i: Record<string, unknown>) => Promise<unknown>,
  delete_file: deleteFile as (i: Record<string, unknown>) => Promise<unknown>,
};

// ─── Stubbed Claude message (replace with real API call) ──────────────────────

const stubbedMessage = {
  content: [
    {
      type: "tool_use" as const,
      id: "toolu_01",
      name: "send_email",
      input: { to: "user@example.com", subject: "Hello from BehalfID" },
    },
    {
      type: "tool_use" as const,
      id: "toolu_02",
      name: "delete_file",
      input: { path: "/etc/hosts" },
    },
  ],
};

// ─── Tool-use loop ────────────────────────────────────────────────────────────

async function main() {
  const toolResults: unknown[] = [];

  for (const block of stubbedMessage.content) {
    if (block.type !== "tool_use") continue;

    console.log(`\n[TOOL USE] id=${block.id} name=${block.name}`);
    console.log(`[VERIFY]   action=${block.name} agentId=${integrationConfig.agentId}`);

    const gated = await checkToolUse(
      integrationConfig,
      block,
      async () => handlers[block.name]?.(block.input) ?? null
    );

    if (gated.blocked) {
      console.log(`[DENY]     reason=${gated.reason} risk=${gated.risk}`);
      const denied = buildDeniedToolResult(gated.tool_use_id, gated.reason);
      toolResults.push(denied);
      console.log("[TOOL RESULT SENT TO MODEL]", denied);
      continue;
    }

    console.log(`[ALLOW]    requestId=${gated.requestId} result=`, gated.result);
    toolResults.push({
      type: "tool_result",
      tool_use_id: gated.tool_use_id,
      content: JSON.stringify(gated.result),
    });
  }

  // toolResults is now ready to include in the next messages.create() call
  // as a "user" turn with role: "user", content: toolResults
  console.log("\n[SUMMARY] tool results ready to send back to model:", toolResults.length, "items");
}

main().catch(console.error);
