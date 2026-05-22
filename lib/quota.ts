import { getQuotas, isSameBillingPeriod, verificationPeriodStart, type Plan } from "@/lib/plans";
import Account from "@/models/Account";
import Agent from "@/models/Agent";

export type QuotaErrorCode =
  | "AGENT_LIMIT_REACHED"
  | "VERIFICATION_LIMIT_REACHED"
  | "WEBHOOKS_REQUIRE_PRO";

export type QuotaResult = {
  allowed: boolean;
  reason?: string;
  code?: QuotaErrorCode;
  plan?: Plan;
  limit?: number;
  upgradeHint?: string;
};

function normalizePlan(plan: string | null | undefined): Plan {
  return plan === "pro" || plan === "enterprise" ? plan : "free";
}

export function quotaErrorDetails(result: QuotaResult) {
  return {
    code: result.code,
    currentPlan: result.plan,
    limit: result.limit,
    upgradeHint: result.upgradeHint
  };
}

export async function checkAndIncrementVerifications(accountId: string | null | undefined): Promise<QuotaResult> {
  // TODO: Revisit whether missing account state should fail closed or remain unmetered.
  if (!accountId) return { allowed: true };

  const account = await Account.findOne({ accountId });
  if (!account) return { allowed: true };

  const quotas = getQuotas(account.plan as Plan);
  if (!isFinite(quotas.verificationsPerMonth)) return { allowed: true };

  if (!isSameBillingPeriod(account.verificationPeriodStart)) {
    await Account.updateOne(
      { accountId },
      { $set: { verificationCount: 1, verificationPeriodStart: verificationPeriodStart() } }
    );
    return { allowed: true };
  }

  if (account.verificationCount >= quotas.verificationsPerMonth) {
    return {
      allowed: false,
      code: "VERIFICATION_LIMIT_REACHED",
      plan: account.plan as Plan,
      limit: quotas.verificationsPerMonth,
      reason: `Monthly verification limit of ${quotas.verificationsPerMonth.toLocaleString()} reached on the ${account.plan} plan.`,
      upgradeHint: account.plan === "free" ? "Upgrade to Pro to continue." : "Contact BehalfID for Enterprise limits."
    };
  }

  await Account.updateOne({ accountId }, { $inc: { verificationCount: 1 } });
  return { allowed: true };
}

export async function checkAgentLimit(accountId: string | null | undefined): Promise<QuotaResult> {
  // TODO: Revisit whether missing account state should fail closed or remain unmetered.
  if (!accountId) return { allowed: true };

  const account = await Account.findOne({ accountId });
  if (!account) return { allowed: true };

  const quotas = getQuotas(account.plan as Plan);
  if (!isFinite(quotas.maxAgents)) return { allowed: true };

  const count = await Agent.countDocuments({ accountId });
  if (count >= quotas.maxAgents) {
    return {
      allowed: false,
      code: "AGENT_LIMIT_REACHED",
      plan: account.plan as Plan,
      limit: quotas.maxAgents,
      reason: `Agent limit of ${quotas.maxAgents} reached on the ${account.plan} plan.`,
      upgradeHint: account.plan === "free" ? "Upgrade to Pro to add more agents." : "Contact BehalfID for Enterprise limits."
    };
  }

  return { allowed: true };
}

export function checkWebhooksEnabled(plan: string | null | undefined): QuotaResult {
  const resolvedPlan = normalizePlan(plan);
  const quotas = getQuotas(resolvedPlan);
  if (!quotas.webhooksEnabled) {
    return {
      allowed: false,
      code: "WEBHOOKS_REQUIRE_PRO",
      plan: resolvedPlan,
      limit: 0,
      reason: "Webhooks require Pro or Enterprise.",
      upgradeHint: "Upgrade to Pro to enable webhook delivery."
    };
  }
  return { allowed: true };
}

export function retentionSince(plan: string | null | undefined): Date {
  const resolvedPlan = normalizePlan(plan);
  const quotas = getQuotas(resolvedPlan);
  return new Date(Date.now() - quotas.logRetentionDays * 86_400_000);
}
