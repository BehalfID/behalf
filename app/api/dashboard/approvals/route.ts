import { type NextRequest } from "next/server";
import { accountScopeFilter } from "@/lib/accountAccess";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { enrichApprovalForActor, getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { noCacheJson } from "@/lib/responses";
import Agent from "@/models/Agent";
import ApprovalRequest from "@/models/ApprovalRequest";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.user.primaryAccountId);
  if (!actor) return noCacheJson({ approvals: [], workspaceAuthority: null });

  const status = request.nextUrl.searchParams.get("status")?.trim();
  const query: Record<string, unknown> = { ...accountScopeFilter(actor.accountId) };
  if (status && ["pending", "approved", "denied", "used"].includes(status)) {
    query.status = status;
  } else {
    query.status = { $in: ["pending", "approved"] };
  }

  const approvals = await ApprovalRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .select("-_id approvalId requestId agentId permissionId action vendor amount status resolvedBy resolvedAt grantExpiresAt requiredAuthorityLevel developerUserId createdAt")
    .lean();

  const agentIds = [...new Set(approvals.map((a) => a.agentId))];
  const agents = agentIds.length
    ? await Agent.find({ ...accountScopeFilter(actor.accountId), agentId: { $in: agentIds } })
        .select("-_id agentId name")
        .lean()
    : [];
  const nameMap = new Map(agents.map((a) => [a.agentId, a.name]));

  const approvalsWithNames = approvals.map((a) => {
    const withName = {
      ...a,
      agentName: nameMap.get(a.agentId) ?? null
    };
    return enrichApprovalForActor(withName, actor);
  });

  return noCacheJson({
    approvals: approvalsWithNames,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}
