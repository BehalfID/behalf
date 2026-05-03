import { NextResponse, type NextRequest } from "next/server";
import { getDeveloperAgentDetail } from "@/lib/dashboardData";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { agentId } = await context.params;
  const detail = await getDeveloperAgentDetail(auth.user.userId, agentId);
  if (!detail) return jsonError("Agent not found.", 404);
  return NextResponse.json(detail);
}
