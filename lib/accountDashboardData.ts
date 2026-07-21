import { accountScopeFilter } from "@/lib/accountAccess";
import { backfillLegacyAgentsForActor } from "@/lib/accountAgents";
import type { WorkspaceActor } from "@/lib/delegatedAuth";
import { findAgentByAccountScope } from "@/lib/repositories/agents";
import {
  backfillPermissionAccountId,
  findPermissionsByAccountAndAgent
} from "@/lib/repositories/permissions";
import {
  backfillVerificationLogAccountId,
  findVerificationLogs
} from "@/lib/repositories/verificationLogs";
import { serializeAgent } from "@/lib/dashboardData";

async function backfillLegacyAgentResources(actor: WorkspaceActor, agentId: string) {
  await Promise.all([
    backfillPermissionAccountId(agentId, actor.accountId),
    backfillVerificationLogAccountId(agentId, actor.accountId)
  ]);
}

export async function getAccountAgentDetail(actor: WorkspaceActor, agentId: string) {
  await backfillLegacyAgentsForActor(actor);
  const agent = await findAgentByAccountScope(accountScopeFilter(actor.accountId), agentId);
  if (!agent) return null;

  await backfillLegacyAgentResources(actor, agentId);

  const [permissions, logs] = await Promise.all([
    findPermissionsByAccountAndAgent(accountScopeFilter(actor.accountId), agentId, {
      limit: 50,
      select:
        "-_id permissionId action description resource scope allowedActions blockedActions requiresApproval notes template constraints requiredAuthorityLevel status lastUsedAt createdAt updatedAt"
    }),
    findVerificationLogs(
      { ...accountScopeFilter(actor.accountId), agentId },
      {
        limit: 25,
        select: "-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt"
      }
    )
  ]);

  return { agent: serializeAgent(agent), permissions, logs };
}
