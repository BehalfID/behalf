import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { agentAuthJsonError } from "@/lib/appErrors";
import { authenticateAgent, hashApiKey } from "@/lib/auth";
import { createApiKey } from "@/lib/ids";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { updateAgent } from "@/lib/repositories/agents";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { agentId } = await context.params;
  if (!agentId) {
    return jsonError("agentId is required.");
  }

  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  const auth = await authenticateAgent(request, agentId);
  if (auth.error || !auth.agent) {
    return agentAuthJsonError(auth.error);
  }

  const limit = await checkRateLimit(request, auth.agent.apiKeyHash);
  if (limit.limited) {
    return rateLimitError();
  }

  const apiKey = createApiKey();
  const result = await updateAgent(
    { agentId, apiKeyHash: auth.agent.apiKeyHash },
    {
      $set: { apiKeyHash: hashApiKey(apiKey), keyRotatedAt: new Date() },
      $unset: { lastUsedAt: "" }
    }
  );
  if (result.matchedCount !== 1) {
    return jsonError("API key has already been rotated.", 409);
  }

  await emitWebhookEvent(
    createWebhookEvent(
      auth.agent.accountId,
      "agent.key_rotated",
      { agentId },
      auth.agent.developerUserId
    )
  );

  return NextResponse.json({ agentId, apiKey });
}
