import { type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { noCacheJson } from "@/lib/responses";
import Agent from "@/models/Agent";
import ApprovalRequest from "@/models/ApprovalRequest";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const status = request.nextUrl.searchParams.get("status")?.trim();
  const query: Record<string, unknown> = { developerUserId: auth.user.userId };
  if (status && ["pending", "approved", "denied", "used"].includes(status)) {
    query.status = status;
  } else {
    // Default: pending + approved (actionable views only)
    query.status = { $in: ["pending", "approved"] };
  }

  const approvals = await ApprovalRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .select("-_id approvalId requestId agentId permissionId action vendor amount status resolvedBy resolvedAt grantExpiresAt createdAt")
    .lean();

  // Attach agent names so the dashboard can show human-readable labels.
  const agentIds = [...new Set(approvals.map((a) => a.agentId))];
  const agents = agentIds.length
    ? await Agent.find({ developerUserId: auth.user.userId, agentId: { $in: agentIds } })
        .select("-_id agentId name")
        .lean()
    : [];
  const nameMap = new Map(agents.map((a) => [a.agentId, a.name]));

  const approvalsWithNames = approvals.map((a) => ({
    ...a,
    agentName: nameMap.get(a.agentId) ?? null
  }));

  return noCacheJson({ approvals: approvalsWithNames });
}
