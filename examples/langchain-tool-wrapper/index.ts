/**
 * LangChain tool wrapper — runnable example.
 *
 * Demonstrates wrapToolWithBehalfID() as a drop-in replacement for LangChain
 * tool registration. The LangChain tool interface is satisfied via duck typing
 * — no LangChain package is installed for this example; the tool shape is
 * implemented directly to show the structural compatibility.
 *
 * In a real project you would import DynamicTool from "@langchain/core/tools"
 * and pass it directly; the wrapper accepts the same interface.
 *
 * Run:
 *   cp .env.example .env
 *   npx tsx index.ts
 *
 * Expected output (allow scenario):
 *   [ALLOW] purchaseTicket result: ticket_abc123
 *
 * Expected output (deny scenario):
 *   [DENY]  purchaseTicket reason: No active permission exists for this action.
 */

import { config as loadEnv } from "dotenv";
import { BehalfID } from "@behalfid/sdk";
import { wrapToolWithBehalfID, wrapToolsWithBehalfID } from "../../integrations/langchain/index.js";

loadEnv();

const behalf = new BehalfID({ apiKey: process.env.BEHALFID_API_KEY! });

const integrationConfig = {
  client: behalf,
  agentId: process.env.BEHALFID_AGENT_ID!,
};

// ─── Stub LangChain-compatible tools ─────────────────────────────────────────

const purchaseTicketTool = {
  name: "purchaseTicket",
  description: "Purchase a ticket for a given event.",
  call: async (input: string) => {
    console.log("[HANDLER] purchaseTicket called with:", input);
    return "ticket_abc123";
  },
};

const sendEmailTool = {
  name: "sendEmail",
  description: "Send an email to a recipient.",
  call: async (input: string) => {
    console.log("[HANDLER] sendEmail called with:", input);
    return "email_sent";
  },
};

// ─── Wrap tools ───────────────────────────────────────────────────────────────

const safePurchaseTool = wrapToolWithBehalfID(integrationConfig, purchaseTicketTool, {
  amount: 250,
  vendor: "ticketmaster.com",
  metadata: { source: "agent" },
});

// Bulk wrap — same config applies to all tools
const [safeSendEmailTool] = wrapToolsWithBehalfID(integrationConfig, [sendEmailTool]);

// ─── Simulate agent executor calling the tools ────────────────────────────────

async function main() {
  console.log("=== purchaseTicket ===");
  const purchaseResult = await safePurchaseTool.call("event_123");
  if (typeof purchaseResult === "object" && purchaseResult !== null && "blocked" in purchaseResult) {
    console.log("[DENY] ", safePurchaseTool.name, "reason:", (purchaseResult as { reason: string }).reason);
  } else {
    console.log("[ALLOW]", safePurchaseTool.name, "result:", purchaseResult);
  }

  console.log("\n=== sendEmail ===");
  const emailResult = await safeSendEmailTool.call("user@example.com");
  if (typeof emailResult === "object" && emailResult !== null && "blocked" in emailResult) {
    console.log("[DENY] ", safeSendEmailTool.name, "reason:", (emailResult as { reason: string }).reason);
  } else {
    console.log("[ALLOW]", safeSendEmailTool.name, "result:", emailResult);
  }
}

main().catch(console.error);
