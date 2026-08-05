import { hashApiKey } from "@/lib/auth";
import { normalizeAgentMetadata, type AgentProvider, type AgentType, type ConnectionStatus } from "@/lib/agents";
import { createApiKey, createPublicId } from "@/lib/ids";
import { verificationPeriodStart } from "@/lib/plans";
import { effectiveEntitlements, effectivePlan } from "@/lib/planGrants";
import { countBillableSeats } from "@/lib/quota";
import type { AccountLean } from "@/lib/repositories/accounts";
import { countAgentsByScope, createAgent, findOneAgent } from "@/lib/repositories/agents";
import { countProtectedReposByAccountId } from "@/lib/repositories/managedProfiles";
import { countPermissions, findPermissions } from "@/lib/repositories/permissions";
import { countLogs, findLogs } from "@/lib/repositories/verificationLogs";
import {
  countWebhookEvents,
  findEndpoint,
  listDeliveries
} from "@/lib/repositories/webhooks";

export function serializeAgent(agent: {
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
  ollamaBaseUrl?: string | null;
  ollamaModel?: string | null;
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
    ollamaBaseUrl: agent.ollamaBaseUrl ?? null,
    ollamaModel: agent.ollamaModel ?? null,
    publicPassportTokenPreview: agent.publicPassportTokenPreview ?? null,
    publicPassportEnabled: agent.publicPassportEnabled ?? false,
    lastUsedAt: agent.lastUsedAt ?? null,
    keyRotatedAt: agent.keyRotatedAt ?? null,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt
  };
}

export async function createDeveloperAgent(
  userId: string,
  accountId: string | undefined,
  input: {
    name: string;
    agentType?: AgentType;
    provider?: AgentProvider;
    externalAgentId?: string;
    externalAgentLabel?: string;
    connectionStatus?: ConnectionStatus;
    description?: string;
  }
) {
  const apiKey = createApiKey();
  const agent = await createAgent({
    agentId: createPublicId("agent"),
    ...(accountId ? { accountId } : {}),
    developerUserId: userId,
    name: input.name,
    agentType: input.agentType ?? "native",
    provider: input.provider ?? "custom",
    externalAgentId: input.externalAgentId,
    externalAgentLabel: input.externalAgentLabel,
    connectionStatus: input.connectionStatus ?? "manual",
    description: input.description,
    apiKeyHash: hashApiKey(apiKey),
    status: "active"
  });

  return { agent: serializeAgent(agent), apiKey };
}

function nextVerificationReset(periodStart?: Date | null) {
  const start = periodStart ? new Date(periodStart) : verificationPeriodStart();
  if (Number.isNaN(start.getTime())) return verificationPeriodStart();
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export async function getDeveloperAgentDetail(userId: string, agentId: string) {
  const agent = await findOneAgent({ developerUserId: userId, agentId });
  if (!agent) return null;

  const [permissions, logs] = await Promise.all([
    findPermissions(
      { developerUserId: userId, agentId },
      {
        sort: { createdAt: -1 },
        limit: 50,
        select:
          "-_id permissionId action description resource scope allowedActions blockedActions requiresApproval notes template constraints requiredAuthorityLevel status lastUsedAt createdAt updatedAt"
      }
    ),
    findLogs(
      { developerUserId: userId, agentId },
      {
        sort: { createdAt: -1 },
        limit: 25,
        select: "-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt"
      }
    )
  ]);

  return { agent: serializeAgent(agent), permissions, logs };
}

export async function getDashboardSummary(userId: string, account?: AccountLean | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scope = account?.accountId ? { accountId: account.accountId } : { developerUserId: userId };
  const [
    totalAgents,
    activePermissions,
    logsToday,
    pendingEvents,
    failedEvents,
    seatCount,
    protectedRepoCount
  ] = await Promise.all([
    countAgentsByScope(scope as { accountId: string } | { developerUserId: string }),
    countPermissions({ ...scope, status: "active" }),
    countLogs({ ...scope, createdAt: { $gte: today } }),
    countWebhookEvents({ ...scope, status: "pending" }),
    countWebhookEvents({ ...scope, deadLetter: true }),
    account?.accountId ? countBillableSeats(account.accountId) : Promise.resolve(0),
    account?.accountId
      ? countProtectedReposByAccountId(account.accountId)
      : Promise.resolve(0)
  ]);

  // The dashboard reports what the workspace can actually do, so a granted
  // plan must be reflected here as well as in enforcement.
  const plan = effectivePlan(account);
  const entitlements = effectiveEntitlements(account);

  return {
    totalAgents,
    activePermissions,
    logsToday,
    pendingEvents,
    failedEvents,
    usage: {
      plan,
      seatCount,
      seatLimit: entitlements.maxBillableUsers,
      agentCount: totalAgents,
      agentLimit: entitlements.maxAgents,
      protectedRepoCount,
      protectedRepoLimit: entitlements.maxProtectedRepos,
      verificationCount: account?.verificationCount ?? 0,
      verificationLimit: entitlements.monthlyVerifications,
      verificationPeriodStart: (account?.verificationPeriodStart ?? verificationPeriodStart()).toISOString(),
      verificationPeriodResetAt: nextVerificationReset(account?.verificationPeriodStart).toISOString(),
      webhooksEnabled: entitlements.webhooksEnabled,
      logRetentionDays: entitlements.logRetentionDays,
      stripeSubscriptionStatus: account?.stripeSubscriptionStatus ?? null
    }
  };
}

export async function getDeveloperWebhookDetail(userId: string, webhookId: string) {
  const webhook = await findEndpoint({ developerUserId: userId, webhookId });
  if (!webhook) return null;

  const deliveries = await listDeliveries(
    { developerUserId: userId, webhookId },
    { sort: { createdAt: -1 }, limit: 50 }
  );

  return { webhook, deliveries };
}
