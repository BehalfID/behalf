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
