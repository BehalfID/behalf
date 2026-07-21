import Agent from "@/models/Agent";

export type AgentCountScope =
  | { accountId: string }
  | { developerUserId: string };

export async function countAgentsByAccountId(accountId: string) {
  return Agent.countDocuments({ accountId });
}

export async function countAgentsByScope(scope: AgentCountScope) {
  return Agent.countDocuments(scope);
}

export async function findAgentByAccountScope(
  accountFilter: Record<string, unknown>,
  agentId: string
) {
  return Agent.findOne({ ...accountFilter, agentId });
}

export async function findAgentsByAccountIdLean(accountId: string) {
  return Agent.find({ accountId }).select("agentId accountId").lean();
}

export async function backfillMissingAgentAccountIds(accountId: string) {
  return Agent.updateMany(
    { $or: [{ accountId: { $exists: false } }, { accountId: null }] },
    { $set: { accountId } }
  );
}

export async function findAgentNamesByIds(
  agentIds: string[],
  scope: { developerUserId?: string; accountId?: string }
) {
  const query: Record<string, unknown> = { agentId: { $in: agentIds } };
  if (scope.developerUserId) query.developerUserId = scope.developerUserId;
  if (scope.accountId) query.accountId = scope.accountId;
  return Agent.find(query).select("-_id agentId name").lean();
}
