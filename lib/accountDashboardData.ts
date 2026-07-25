import { accountScopeFilter } from "@/lib/accountAccess";
import { backfillLegacyAgentsForActor } from "@/lib/accountAgents";
import type { WorkspaceActor } from "@/lib/delegatedAuth";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";
import { serializeAgent } from "@/lib/dashboardData";

const missingAccountIdClause = {
  $or: [{ accountId: { $exists: false } }, { accountId: null }]
};

async function backfillLegacyAgentResources(actor: WorkspaceActor, agentId: string) {
  await Promise.all([
    Permission.updateMany(
      { agentId, ...missingAccountIdClause },
      { $set: { accountId: actor.accountId } }
    ),
    VerificationLog.updateMany(
      { agentId, ...missingAccountIdClause },
      { $set: { accountId: actor.accountId } }
    )
  ]);
}

export async function getAccountAgentDetail(actor: WorkspaceActor, agentId: string) {
  await backfillLegacyAgentsForActor(actor);
  const agent = await Agent.findOne({ ...accountScopeFilter(actor.accountId), agentId });
  if (!agent) return null;

  await backfillLegacyAgentResources(actor, agentId);

  const recentDeniedSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const permissionScope = { ...accountScopeFilter(actor.accountId), agentId };
  const [
    permissions,
    activePermissions,
    approvalGatedPermissions,
    revokedPermissions,
    recentDeniedActions
  ] = await Promise.all([
    Permission.find(permissionScope)
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-_id permissionId action description resource scope allowedActions blockedActions requiresApproval notes template constraints requiredAuthorityLevel replacesPermissionId replacedByPermissionId status lastUsedAt createdAt updatedAt")
      .lean(),
    Permission.countDocuments({ ...permissionScope, status: "active" }),
    Permission.countDocuments({ ...permissionScope, status: "active", requiresApproval: true }),
    Permission.countDocuments({ ...permissionScope, status: "revoked" }),
    VerificationLog.countDocuments({
      ...accountScopeFilter(actor.accountId),
      agentId,
      allowed: false,
      createdAt: { $gte: recentDeniedSince }
    })
  ]);

  return {
    agent: serializeAgent(agent),
    permissions,
    securityPosture: {
      activePermissions,
      approvalGatedPermissions,
      revokedPermissions,
      recentDeniedActions,
      recentDeniedSince: recentDeniedSince.toISOString()
    }
  };
}
