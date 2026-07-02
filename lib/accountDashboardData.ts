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

  const [permissions, logs] = await Promise.all([
    Permission.find({ ...accountScopeFilter(actor.accountId), agentId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-_id permissionId action description resource scope allowedActions blockedActions requiresApproval notes template constraints requiredAuthorityLevel status lastUsedAt createdAt updatedAt")
      .lean(),
    VerificationLog.find({ ...accountScopeFilter(actor.accountId), agentId })
      .sort({ createdAt: -1 })
      .limit(25)
      .select("-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt")
      .lean()
  ]);

  return { agent: serializeAgent(agent), permissions, logs };
}
