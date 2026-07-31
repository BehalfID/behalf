import { type NextRequest } from "next/server";
import { accountScopeFilter } from "@/lib/accountAccess";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { enrichApprovalForActor, getWorkspaceActor, serializeWorkspaceAuthority } from "@/lib/delegatedAuth";
import { noCacheJson } from "@/lib/responses";
import { BEHALF_CLI_PAUSE_AGENT_ID } from "@/lib/managedProfilePauseApproval";
import { listAgents } from "@/lib/repositories/agents";
import { findApprovals } from "@/lib/repositories/approvals";
import { findUsers } from "@/lib/repositories/users";
import { findLogs } from "@/lib/repositories/verificationLogs";

const APPROVAL_SELECT =
  "-_id approvalId requestId kind agentId permissionId action vendor amount status resolvedBy resolvedAt usedAt grantExpiresAt requiredAuthorityLevel developerUserId createdAt argumentKind argumentPreview argumentPreviewTruncated pauseTool pauseRepo pauseBranch pauseDeviceId pauseScope requestedDurationMinutes pauseReason contextReason";


const DENIED_HIGH_RISK_WINDOW_MS = 48 * 60 * 60 * 1_000;

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return noCacheJson({ pendingApprovals: [], deniedHighRisk: [], workspaceAuthority: null });

  const since = new Date(Date.now() - DENIED_HIGH_RISK_WINDOW_MS);

  const [rawApprovals, rawDenied] = await Promise.all([
    findApprovals({
      ...accountScopeFilter(actor.accountId),
      status: { $in: ["pending", "approved"] }
    }, { sort: { createdAt: -1 }, limit: 50, select: APPROVAL_SELECT }),
    findLogs({
      ...accountScopeFilter(actor.accountId),
      allowed: false,
      risk: "high",
      createdAt: { $gte: since }
    }, { sort: { createdAt: -1 }, limit: 50, select: "-_id requestId agentId permissionId action vendor amount allowed approvalRequired reason risk metadata createdAt" })
  ]);

  const agentIds = [
    ...new Set([
      ...rawApprovals
        .map((a) => a.agentId)
        .filter((id): id is string => !!id && id !== BEHALF_CLI_PAUSE_AGENT_ID),
      ...rawDenied.map((d) => d.agentId),
    ]),
  ];
  const agents = agentIds.length
    ? await listAgents({ ...accountScopeFilter(actor.accountId), agentId: { $in: agentIds } }, { select: "-_id agentId name" })
    : [];
  const nameMap = new Map(agents.map((a) => [a.agentId, a.name]));

  const requesterIds = [
    ...new Set(
      rawApprovals
        .filter((a) => a.kind === "managed_profile_pause" && a.developerUserId)
        .map((a) => a.developerUserId as string)
    ),
  ];
  const requesters = requesterIds.length
    ? await findUsers({ userId: { $in: requesterIds } }, { select: "-_id userId email firstName lastName" })
    : [];
  const requesterMap = new Map(
    requesters.map((u) => {
      const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
      return [u.userId, displayName || u.email || u.userId];
    })
  );

  const sortedApprovals = [...rawApprovals].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime();
  });

  const pendingApprovals = sortedApprovals.map((a) =>
    enrichApprovalForActor(
      {
        ...a,
        agentName:
          a.kind === "managed_profile_pause"
            ? null
            : (nameMap.get(a.agentId as string) ?? null),
        requesterName:
          a.kind === "managed_profile_pause"
            ? (requesterMap.get(a.developerUserId as string) ?? a.developerUserId ?? null)
            : null,
      },
      actor
    )
  );

  const deniedHighRisk = rawDenied.map((d) => ({
    ...d,
    agentName: nameMap.get(d.agentId) ?? null
  }));

  return noCacheJson({
    pendingApprovals,
    deniedHighRisk,
    workspaceAuthority: serializeWorkspaceAuthority(actor)
  });
}
