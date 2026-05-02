import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/responses";
import VerificationLog from "@/models/VerificationLog";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  await connectToDatabase();

  const { agentId } = await context.params;
  if (!agentId) {
    return jsonError("agentId is required.");
  }

  const auth = await authenticateAgent(request, agentId);
  if (auth.error) {
    return jsonError(auth.error, auth.error === "Unknown agent." ? 404 : 401);
  }

  const logs = await VerificationLog.find({ agentId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("-_id agentId action amount vendor allowed reason risk createdAt")
    .lean();

  return NextResponse.json(logs);
}
