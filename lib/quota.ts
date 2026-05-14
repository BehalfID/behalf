import { getQuotas, isSameBillingPeriod, verificationPeriodStart, type Plan } from "@/lib/plans";
import Account from "@/models/Account";
import Agent from "@/models/Agent";

type QuotaResult = { allowed: boolean; reason?: string };

export async function checkAndIncrementVerifications(accountId: string | null | undefined): Promise<QuotaResult> {
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
      reason: `Monthly verification limit of ${quotas.verificationsPerMonth.toLocaleString()} reached. Upgrade to Pro to continue.`
    };
  }

  await Account.updateOne({ accountId }, { $inc: { verificationCount: 1 } });
  return { allowed: true };
}

export async function checkAgentLimit(accountId: string | null | undefined): Promise<QuotaResult> {
  if (!accountId) return { allowed: true };

  const account = await Account.findOne({ accountId });
  if (!account) return { allowed: true };

  const quotas = getQuotas(account.plan as Plan);
  if (!isFinite(quotas.maxAgents)) return { allowed: true };

  const count = await Agent.countDocuments({ accountId });
  if (count >= quotas.maxAgents) {
    return {
      allowed: false,
      reason: `Agent limit of ${quotas.maxAgents} reached on the ${account.plan} plan. Upgrade to Pro to add more agents.`
    };
  }

  return { allowed: true };
}

export function checkWebhooksEnabled(plan: string | null | undefined): QuotaResult {
  const resolvedPlan = (plan ?? "free") as Plan;
  const quotas = getQuotas(resolvedPlan);
  if (!quotas.webhooksEnabled) {
    return {
      allowed: false,
      reason: "Webhooks are a Pro feature. Upgrade to enable webhook delivery."
    };
  }
  return { allowed: true };
}

export function retentionSince(plan: string | null | undefined): Date {
  const resolvedPlan = (plan ?? "free") as Plan;
  const quotas = getQuotas(resolvedPlan);
  return new Date(Date.now() - quotas.logRetentionDays * 86_400_000);
}
