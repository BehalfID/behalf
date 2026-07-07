import { getQuotas, isSameBillingPeriod, verificationPeriodStart, type Plan } from "@/lib/plans";
import Account from "@/models/Account";
import Agent from "@/models/Agent";

export type QuotaErrorCode =
  | "ACCOUNT_CONTEXT_MISSING"
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

/**
 * Decision (issue #77): metered quota helpers fail closed when accountId is missing.
 *
 * Call-site audit:
 * - POST /api/verify passes the authenticated agent's accountId. Every supported
 *   agent-creation path sets accountId (developer-token account, workspace actor
 *   account, or the default account via getDefaultAccountId/getConsoleAccountId),
 *   and legacy agents are repaired by backfillDefaultAccountId. A missing value
 *   here means account context was lost on a metered, billable path.
 * - POST /api/agents resolves tokenDoc.accountId (schema-required) or the default
 *   account, so accountId is always present.
 * - Dashboard agent-creation routes run requireWorkspaceMutationActor first, which
 *   rejects requests without a resolvable workspace account.
 *
 * No demo/bootstrap flow calls these helpers without an accountId, so silently
 * treating missing account context as unmetered would only ever hide a bug and
 * open a quota/billing bypass.
 *
 * A known accountId whose Account document does not exist stays unmetered: account
 * documents are never deleted and every accountId passed here originates from a
 * created Account, so this indicates data inconsistency rather than lost auth
 * context, and denying it would block legitimate traffic without recourse.
 */
function missingAccountContext(): QuotaResult {
  return {
    allowed: false,
    code: "ACCOUNT_CONTEXT_MISSING",
    reason: "Account context is missing for this request, so quota cannot be enforced."
  };
}

export async function checkAndIncrementVerifications(accountId: string | null | undefined): Promise<QuotaResult> {
  if (!accountId) return missingAccountContext();

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
  if (!accountId) return missingAccountContext();

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
