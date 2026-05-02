import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getAgentDetail, getConsoleAccountId } from "@/lib/consoleData";
import { jsonError } from "@/lib/responses";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { agentId } = await context.params;
  const accountId = await getConsoleAccountId();
  const detail = await getAgentDetail(agentId, accountId);

  if (!detail) {
    return jsonError("Agent not found.", 404);
  }

  return NextResponse.json(detail);
}
