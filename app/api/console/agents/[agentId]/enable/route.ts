import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { agentId } = await context.params;
  const accountId = await getConsoleAccountId();
  const result = await Agent.updateOne({ accountId, agentId }, { $set: { status: "active" } });
  if (result.matchedCount !== 1) {
    return jsonError("Agent not found.", 404);
  }

  await emitWebhookEvent(createWebhookEvent(accountId, "agent.enabled", { agentId }));

  return NextResponse.json({ enabled: true });
}
