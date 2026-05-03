import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { agentId } = await context.params;
  const result = await Agent.updateOne({ developerUserId: auth.user.userId, agentId }, { $set: { status: "active" } });
  if (result.matchedCount !== 1) return jsonError("Agent not found.", 404);
  await emitWebhookEvent(createWebhookEvent(null, "agent.enabled", { agentId }, auth.user.userId));
  return NextResponse.json({ enabled: true });
}
