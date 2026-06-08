import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import {
  buildVerificationLogQuery,
  calculateVerificationLogSummary,
  parseLogListParams,
  sanitizeVerificationLog,
  type VerificationLogListItem
} from "@/lib/verificationLogs";
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

  const { limit: pageLimit, page, skip } = parseLogListParams(request.nextUrl.searchParams);
  const query = buildVerificationLogQuery(request.nextUrl.searchParams, { agentId });
  const [rawLogs, total, summaryLogs] = await Promise.all([
    VerificationLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .select(
        "-_id requestId agentId permissionId action amount vendor allowed approvalRequired reason risk shadow createdAt"
      )
      .lean<VerificationLogListItem[]>(),
    VerificationLog.countDocuments(query),
    VerificationLog.find(query)
      .sort({ createdAt: -1 })
      .limit(1000)
      .select(
        "-_id requestId agentId permissionId action amount vendor allowed approvalRequired reason risk shadow createdAt"
      )
      .lean<VerificationLogListItem[]>()
  ]);
  const logs = rawLogs.map(sanitizeVerificationLog);
  const legacy = request.nextUrl.searchParams.size === 0;

  if (legacy) {
    return NextResponse.json(logs.slice(0, 50));
  }

  return NextResponse.json({
    logs,
    summary: calculateVerificationLogSummary(summaryLogs),
    pagination: { limit: pageLimit, page, total, hasMore: skip + logs.length < total }
  });
}
