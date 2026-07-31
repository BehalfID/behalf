import { normalizeAgentMetadata } from "@/lib/agents";
import { findOneAgent } from "@/lib/repositories/agents";
import { findPermissions } from "@/lib/repositories/permissions";
import { findLogs } from "@/lib/repositories/verificationLogs";

export async function getConsoleAccountId() {
  const { backfillDefaultAccountId } = await import("@/lib/account");
  return backfillDefaultAccountId();
}

export async function getConsoleAgent(agentId: string, accountId: string) {
  return findOneAgent({ agentId, accountId });
}

export async function serializeAgent(agent: {
  agentId: string;
  name: string;
  status?: string | null;
  agentType?: string | null;
  provider?: string | null;
  externalAgentId?: string | null;
  externalAgentLabel?: string | null;
  connectionStatus?: string | null;
  description?: string | null;
  guidelines?: string[] | null;
  publicPassportTokenPreview?: string | null;
  publicPassportEnabled?: boolean | null;
  lastUsedAt?: Date | null;
  keyRotatedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}) {
  const metadata = normalizeAgentMetadata(agent);
  return {
    agentId: agent.agentId,
    name: agent.name,
    status: agent.status ?? "active",
    ...metadata,
    publicPassportTokenPreview: agent.publicPassportTokenPreview ?? null,
    publicPassportEnabled: agent.publicPassportEnabled ?? false,
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
    findPermissions(
      { agentId, accountId },
      {
        sort: { createdAt: -1 },
        limit: 50,
        select:
          "-_id permissionId action description resource scope blockedActions requiresApproval notes template constraints status lastUsedAt createdAt updatedAt"
      }
    ),
    findLogs(
      { agentId, accountId },
      {
        sort: { createdAt: -1 },
        limit: 25,
        select: "-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt"
      }
    )
  ]);

  return {
    agent: await serializeAgent(agent),
    permissions,
    logs
  };
}
