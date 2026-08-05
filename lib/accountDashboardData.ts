import { accountScopeFilter } from "@/lib/accountAccess";
import { backfillLegacyAgentsForActor } from "@/lib/accountAgents";
import type { WorkspaceActor } from "@/lib/delegatedAuth";
import { serializeAgent } from "@/lib/dashboardData";
import { findOneAgent } from "@/lib/repositories/agents";
import {
  countPermissions,
  findPermissions,
  updatePermissions
} from "@/lib/repositories/permissions";
import { countLogs, updateLogs } from "@/lib/repositories/verificationLogs";
import { MISSING_ACCOUNT_ID_CLAUSE } from "@/lib/missingAccountId";

const missingAccountIdClause = MISSING_ACCOUNT_ID_CLAUSE;

async function backfillLegacyAgentResources(actor: WorkspaceActor, agentId: string) {
  await Promise.all([
    updatePermissions(
      { agentId, ...missingAccountIdClause },
      { $set: { accountId: actor.accountId } }
    ),
    updateLogs(
      { agentId, ...missingAccountIdClause },
      { $set: { accountId: actor.accountId } }
    )
  ]);
}

export async function getAccountAgentDetail(actor: WorkspaceActor, agentId: string) {
  await backfillLegacyAgentsForActor(actor);
  const agent = await findOneAgent({ ...accountScopeFilter(actor.accountId), agentId });
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
    findPermissions(permissionScope, {
      sort: { createdAt: -1 },
      limit: 50,
      select:
        "-_id permissionId action description resource scope allowedActions blockedActions requiresApproval notes template constraints requiredAuthorityLevel status lastUsedAt createdAt updatedAt replacesPermissionId replacedByPermissionId replacementIdempotencyKey"
    }),
    countPermissions({ ...permissionScope, status: "active" }),
    countPermissions({ ...permissionScope, status: "active", requiresApproval: true }),
    countPermissions({ ...permissionScope, status: "revoked" }),
    countLogs({
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
