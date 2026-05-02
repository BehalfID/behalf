import { connectToDatabase } from "@/lib/db";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";

export async function getConsoleAccountId() {
  const { backfillDefaultAccountId } = await import("@/lib/account");
  await connectToDatabase();
  return backfillDefaultAccountId();
}

export async function getConsoleAgent(agentId: string, accountId: string) {
  return Agent.findOne({ agentId, accountId });
}

export async function serializeAgent(agent: {
  agentId: string;
  name: string;
  status?: string | null;
  lastUsedAt?: Date | null;
  keyRotatedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}) {
  return {
    agentId: agent.agentId,
    name: agent.name,
    status: agent.status ?? "active",
    lastUsedAt: agent.lastUsedAt ?? null,
    keyRotatedAt: agent.keyRotatedAt ?? null,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt
  };
}

export async function getAgentDetail(agentId: string, accountId: string) {
  const agent = await getConsoleAgent(agentId, accountId);
  if (!agent) {
    return null;
  }

  const [permissions, logs] = await Promise.all([
    Permission.find({ agentId, accountId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-_id permissionId action description constraints status lastUsedAt createdAt updatedAt")
      .lean(),
    VerificationLog.find({ agentId, accountId })
      .sort({ createdAt: -1 })
      .limit(25)
      .select(
        "-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt"
      )
      .lean()
  ]);

  return {
    agent: await serializeAgent(agent),
    permissions,
    logs
  };
}
