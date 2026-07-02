import { accountScopeFilter } from "@/lib/accountAccess";
import type { WorkspaceActor } from "@/lib/delegatedAuth";
import Agent from "@/models/Agent";

const missingAccountIdClause = {
  $or: [{ accountId: { $exists: false } }, { accountId: null }]
};

/** Backfill accountId on the actor's own legacy agents missing account scoping. */
export async function backfillLegacyAgentsForActor(actor: WorkspaceActor) {
  return Agent.updateMany(
    {
      developerUserId: actor.userId,
      ...missingAccountIdClause
    },
    { $set: { accountId: actor.accountId } }
  );
}

export function accountAgentFilter(actor: WorkspaceActor, agentId: string) {
  return { ...accountScopeFilter(actor.accountId), agentId };
}

export async function findAccountAgent(actor: WorkspaceActor, agentId: string) {
  await backfillLegacyAgentsForActor(actor);
  return Agent.findOne(accountAgentFilter(actor, agentId));
}

export async function listAccountAgents(actor: WorkspaceActor) {
  await backfillLegacyAgentsForActor(actor);
  return Agent.find({ ...accountScopeFilter(actor.accountId) })
    .sort({ createdAt: -1 })
    .select(
      "-_id agentId name status agentType provider externalAgentId externalAgentLabel connectionStatus description lastUsedAt keyRotatedAt createdAt updatedAt"
    )
    .lean();
}

export async function updateAccountAgent(
  actor: WorkspaceActor,
  agentId: string,
  update: Record<string, unknown>
) {
  await backfillLegacyAgentsForActor(actor);
  return Agent.updateOne(accountAgentFilter(actor, agentId), { $set: update });
}
