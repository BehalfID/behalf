import { accountScopeFilter } from "@/lib/accountAccess";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";
import { serializeAgent } from "@/lib/dashboardData";

export async function getAccountAgentDetail(accountId: string, agentId: string) {
  const agent = await Agent.findOne({ ...accountScopeFilter(accountId), agentId });
  if (!agent) return null;

  const [permissions, logs] = await Promise.all([
    Permission.find({ ...accountScopeFilter(accountId), agentId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-_id permissionId action description resource scope allowedActions blockedActions requiresApproval notes template constraints requiredAuthorityLevel status lastUsedAt createdAt updatedAt")
      .lean(),
    VerificationLog.find({ ...accountScopeFilter(accountId), agentId })
      .sort({ createdAt: -1 })
      .limit(25)
      .select("-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt")
      .lean()
  ]);

  return { agent: serializeAgent(agent), permissions, logs };
}
