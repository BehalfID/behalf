import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { createApiKey } from "@/lib/ids";
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
  const apiKey = createApiKey();
  const result = await Agent.updateOne(
    { developerUserId: auth.user.userId, agentId },
    {
      $set: { apiKeyHash: hashApiKey(apiKey), keyRotatedAt: new Date() },
      $unset: { lastUsedAt: "" }
    }
  );
  if (result.matchedCount !== 1) return jsonError("Agent not found.", 404);

  await emitWebhookEvent(
    createWebhookEvent(null, "agent.key_rotated", { agentId }, auth.user.userId)
  );

  return NextResponse.json({ agentId, apiKey });
}
