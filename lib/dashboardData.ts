import { hashApiKey } from "@/lib/auth";
import { normalizeAgentMetadata, type AgentProvider, type AgentType, type ConnectionStatus } from "@/lib/agents";
import { createApiKey, createPublicId } from "@/lib/ids";
import { getQuotas, verificationPeriodStart, type Plan } from "@/lib/plans";
import type { AccountDocument } from "@/models/Account";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";
import WebhookDelivery from "@/models/WebhookDelivery";
import WebhookEndpoint from "@/models/WebhookEndpoint";
import WebhookEvent from "@/models/WebhookEvent";

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
  const agent = await Agent.create({
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
  const agent = await Agent.findOne({ developerUserId: userId, agentId });
  if (!agent) return null;

  const [permissions, logs] = await Promise.all([
    Permission.find({ developerUserId: userId, agentId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-_id permissionId action description resource scope allowedActions blockedActions requiresApproval notes template constraints status lastUsedAt createdAt updatedAt")
      .lean(),
    VerificationLog.find({ developerUserId: userId, agentId })
      .sort({ createdAt: -1 })
      .limit(25)
      .select("-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt")
      .lean()
  ]);

  return { agent: serializeAgent(agent), permissions, logs };
}

export async function getDashboardSummary(userId: string, account?: AccountDocument | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [totalAgents, activePermissions, logsToday, pendingEvents, failedEvents] = await Promise.all([
    Agent.countDocuments({ developerUserId: userId }),
    Permission.countDocuments({ developerUserId: userId, status: "active" }),
    VerificationLog.countDocuments({ developerUserId: userId, createdAt: { $gte: today } }),
    WebhookEvent.countDocuments({ developerUserId: userId, status: "pending" }),
    WebhookEvent.countDocuments({ developerUserId: userId, deadLetter: true })
  ]);

  const plan = (account?.plan ?? "free") as Plan;
  const quotas = getQuotas(plan);

  return {
    totalAgents,
    activePermissions,
    logsToday,
    pendingEvents,
    failedEvents,
    usage: {
      plan,
      agentCount: totalAgents,
      agentLimit: quotas.maxAgents,
      verificationCount: account?.verificationCount ?? 0,
      verificationLimit: quotas.verificationsPerMonth,
      verificationPeriodStart: (account?.verificationPeriodStart ?? verificationPeriodStart()).toISOString(),
      verificationPeriodResetAt: nextVerificationReset(account?.verificationPeriodStart).toISOString(),
      webhooksEnabled: quotas.webhooksEnabled,
      logRetentionDays: quotas.logRetentionDays,
      stripeSubscriptionStatus: account?.stripeSubscriptionStatus ?? null
    }
  };
}

export async function getDeveloperWebhookDetail(userId: string, webhookId: string) {
  const webhook = await WebhookEndpoint.findOne({ developerUserId: userId, webhookId })
    .select("-_id webhookId url secretPreview events status lastTriggeredAt createdAt updatedAt")
    .lean();
  if (!webhook) return null;

  const deliveries = await WebhookDelivery.find({ developerUserId: userId, webhookId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("-_id deliveryId eventId eventType status httpStatus error attempt nextRetryAt maxAttempts createdAt")
    .lean();

  return { webhook, deliveries };
}
