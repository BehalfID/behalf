import type { NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import { serializeAgent } from "@/lib/dashboardData";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError, noCacheJson } from "@/lib/responses";
import Permission from "@/models/Permission";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

/**
 * Public agent self-service endpoint. Returns the authenticated agent's own
 * detail (agent + permissions) using the agent API key, mirroring the shape of
 * GET /api/dashboard/agents/{agentId} (which requires a developer session and
 * is therefore unusable from the CLI/SDK).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { agentId } = await context.params;
  if (!agentId) {
    return jsonError("agentId is required.");
  }

  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  await connectToDatabase();

  const auth = await authenticateAgent(request, agentId);
  if (auth.error || !auth.agent) {
    return jsonError(auth.error, auth.error === "Unknown agent." ? 404 : 401);
  }

  const limit = await checkRateLimit(request, auth.agent.apiKeyHash);
  if (limit.limited) {
    return rateLimitError();
  }

  const permissions = await Permission.find({ accountId: auth.agent.accountId, agentId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select(
      "-_id permissionId action description resource scope allowedActions blockedActions requiresApproval notes template constraints status lastUsedAt createdAt updatedAt"
    )
    .lean();

  return noCacheJson({ agent: serializeAgent(auth.agent), permissions });
}
