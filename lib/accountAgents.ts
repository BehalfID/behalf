import { accountScopeFilter } from "@/lib/accountAccess";
import type { WorkspaceActor } from "@/lib/delegatedAuth";
import Agent from "@/models/Agent";

export function accountAgentFilter(actor: WorkspaceActor, agentId: string) {
  return { ...accountScopeFilter(actor.accountId), agentId };
}

export async function updateAccountAgent(
  actor: WorkspaceActor,
  agentId: string,
  update: Record<string, unknown>
) {
  return Agent.updateOne(accountAgentFilter(actor, agentId), { $set: update });
}
