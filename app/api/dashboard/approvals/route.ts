import { type NextRequest } from "next/server";
import { accountScopeFilter } from "@/lib/accountAccess";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { enrichApprovalForActor, getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { noCacheJson } from "@/lib/responses";
import Agent from "@/models/Agent";
import ApprovalRequest from "@/models/ApprovalRequest";
import DeveloperUser from "@/models/DeveloperUser";
import { BEHALF_CLI_PAUSE_AGENT_ID } from "@/lib/managedProfilePauseApproval";

const APPROVAL_SELECT =
  "-_id approvalId requestId kind agentId permissionId action vendor amount status resolvedBy resolvedAt usedAt grantExpiresAt requiredAuthorityLevel developerUserId createdAt argumentKind argumentPreview argumentPreviewTruncated pauseTool pauseRepo pauseBranch pauseDeviceId pauseScope requestedDurationMinutes pauseReason contextReason";


export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return noCacheJson({ approvals: [], workspaceAuthority: null });

  const status = request.nextUrl.searchParams.get("status")?.trim();
  const query: Record<string, unknown> = { ...accountScopeFilter(actor.accountId) };
  if (status === "all") {
    // no status filter — return every lifecycle state
  } else if (status && ["pending", "approved", "denied", "used"].includes(status)) {
    query.status = status;
  } else {
    query.status = "pending";
  }

  const approvals = await ApprovalRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .select(APPROVAL_SELECT)
    .lean();

  const agentIds = [
    ...new Set(
      approvals
        .map((a) => a.agentId)
        .filter((id): id is string => !!id && id !== BEHALF_CLI_PAUSE_AGENT_ID)
    ),
  ];
  const agents = agentIds.length
    ? await Agent.find({ ...accountScopeFilter(actor.accountId), agentId: { $in: agentIds } })
        .select("-_id agentId name")
        .lean()
    : [];
  const nameMap = new Map(agents.map((a) => [a.agentId, a.name]));

  const requesterIds = [
    ...new Set(
      approvals
        .filter((a) => a.kind === "managed_profile_pause" && a.developerUserId)
        .map((a) => a.developerUserId as string)
    ),
  ];
  const requesters = requesterIds.length
    ? await DeveloperUser.find({ userId: { $in: requesterIds } })
        .select("-_id userId email firstName lastName")
        .lean()
    : [];
  const requesterMap = new Map(
    requesters.map((u) => {
      const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
      return [u.userId, displayName || u.email || u.userId];
    })
  );

  const approvalsWithNames = approvals.map((a) => {
    const isPauseApproval = a.kind === "managed_profile_pause";
    const withName = {
      ...a,
      agentName: isPauseApproval
        ? null
        : (nameMap.get(a.agentId as string) ?? null),
      requesterName: isPauseApproval
        ? (requesterMap.get(a.developerUserId as string) ?? a.developerUserId ?? null)
        : null,
    };
    return enrichApprovalForActor(withName, actor);
  });

  return noCacheJson({
    approvals: approvalsWithNames,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}
