import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import VerificationLog from "@/models/VerificationLog";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

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

  const logs = await VerificationLog.find({ agentId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select(
      "-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt"
    )
    .lean();

  return NextResponse.json(logs);
}
