import {
  getPlanEntitlements,
  isSameBillingPeriod,
  isUnlimitedLimit,
  normalizePlan,
  verificationPeriodStart,
  type Plan
} from "@/lib/plans";
import { isBillableWorkspaceRole } from "@/lib/authority";
import {
  countAgentsByAccountId,
  countBillableSeatsByAccountId,
  findAccountById,
  incrementVerificationCount,
  resetVerificationPeriod
} from "@/lib/repositories";

export type QuotaErrorCode =
  | "ACCOUNT_CONTEXT_MISSING"
  | "AGENT_LIMIT_REACHED"
  | "VERIFICATION_LIMIT_REACHED"
  | "SEAT_LIMIT_REACHED"
  | "PROTECTED_REPO_LIMIT_REACHED"
  | "WEBHOOKS_REQUIRE_PRO"
  | "MANAGED_PROFILES_REQUIRE_PAID_PLAN"
  | "REQUIRED_MODE_REQUIRES_PAID_PLAN";

export type QuotaResult = {
  allowed: boolean;
  reason?: string;
  code?: QuotaErrorCode;
  plan?: Plan;
  limit?: number;
  upgradeHint?: string;
};

function upgradeHintFor(plan: Plan, freeHint: string): string {
  return plan === "free" ? freeHint : "Contact BehalfID for Enterprise limits."; // pragma: allowlist secret
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
 * - Seat-limit and protected-repo checks run behind workspace actor / policy
 *   resolution, both of which require a workspace accountId.
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

  const account = await findAccountById(accountId);
  if (!account) return { allowed: true };

  const plan = normalizePlan(account.plan);
  const entitlements = getPlanEntitlements(plan);
  if (isUnlimitedLimit(entitlements.monthlyVerifications)) return { allowed: true };

  if (!isSameBillingPeriod(account.verificationPeriodStart)) {
    await resetVerificationPeriod(accountId, verificationPeriodStart());
    return { allowed: true };
  }

  if (account.verificationCount >= entitlements.monthlyVerifications) {
    return {
      allowed: false,
      code: "VERIFICATION_LIMIT_REACHED",
      plan,
      limit: entitlements.monthlyVerifications,
      reason: `Monthly verification limit of ${entitlements.monthlyVerifications.toLocaleString()} reached on the ${account.plan} plan.`,
      upgradeHint: upgradeHintFor(plan, "Upgrade to Pro to continue.")
    };
  }

  await incrementVerificationCount(accountId);
  return { allowed: true };
}

export async function checkAgentLimit(accountId: string | null | undefined): Promise<QuotaResult> {
  if (!accountId) return missingAccountContext();

  const account = await findAccountById(accountId);
  if (!account) return { allowed: true };

  const plan = normalizePlan(account.plan);
  const entitlements = getPlanEntitlements(plan);
  if (isUnlimitedLimit(entitlements.maxAgents)) return { allowed: true };

  const count = await countAgentsByAccountId(accountId);
  if (count >= entitlements.maxAgents) {
    return {
      allowed: false,
      code: "AGENT_LIMIT_REACHED",
      plan,
      limit: entitlements.maxAgents,
      reason: `Agent limit of ${entitlements.maxAgents} reached on the ${account.plan} plan.`,
      upgradeHint: upgradeHintFor(plan, "Upgrade to Pro to add more agents.")
    };
  }

  return { allowed: true };
}

/** Counts workspace members holding a billable (mutation-capable) role. */
export async function countBillableSeats(accountId: string): Promise<number> {
  return countBillableSeatsByAccountId(accountId);
}

/**
 * Seat-limit check for adding a member (direct add, invite creation, or invite
 * acceptance). Non-billable roles (VIEWER) never consume a seat. Existing
 * members are never removed when a workspace is over its seat limit; only
 * adding new billable members is blocked.
 */
export async function checkSeatLimit(
  accountId: string | null | undefined,
  role: string
): Promise<QuotaResult> {
  if (!isBillableWorkspaceRole(role)) return { allowed: true };
  if (!accountId) return missingAccountContext();

  const account = await findAccountById(accountId);
  if (!account) return { allowed: true };

  const plan = normalizePlan(account.plan);
  const entitlements = getPlanEntitlements(plan);
  if (isUnlimitedLimit(entitlements.maxBillableUsers)) return { allowed: true };

  const seats = await countBillableSeats(accountId);
  if (seats >= entitlements.maxBillableUsers) {
    return {
      allowed: false,
      code: "SEAT_LIMIT_REACHED",
      plan,
      limit: entitlements.maxBillableUsers,
      reason: `Billable seat limit of ${entitlements.maxBillableUsers} reached on the ${account.plan} plan.`,
      upgradeHint: upgradeHintFor(plan, "Upgrade to Pro to add more billable seats.")
    };
  }

  return { allowed: true };
}

/**
 * Protected-repo creation limit. Denies only when the number of enrolled repos
 * would grow beyond the plan limit; saving or editing an existing over-limit
 * policy without adding repos is always allowed (existing resources are never
 * disabled or deleted by entitlement enforcement).
 */
export async function checkProtectedRepoLimit(
  accountId: string | null | undefined,
  counts: { currentCount: number; nextCount: number }
): Promise<QuotaResult> {
  if (counts.nextCount <= counts.currentCount) return { allowed: true };
  if (!accountId) return missingAccountContext();

  const account = await findAccountById(accountId);
  if (!account) return { allowed: true };

  const plan = normalizePlan(account.plan);
  const entitlements = getPlanEntitlements(plan);
  if (isUnlimitedLimit(entitlements.maxProtectedRepos)) return { allowed: true };

  if (counts.nextCount > entitlements.maxProtectedRepos) {
    return {
      allowed: false,
      code: "PROTECTED_REPO_LIMIT_REACHED",
      plan,
      limit: entitlements.maxProtectedRepos,
      reason: `Protected repo limit of ${entitlements.maxProtectedRepos} reached on the ${account.plan} plan.`,
      upgradeHint: upgradeHintFor(plan, "Upgrade to Pro to protect more repositories.")
    };
  }

  return { allowed: true };
}

export function checkWebhooksEnabled(plan: string | null | undefined): QuotaResult {
  const resolvedPlan = normalizePlan(plan);
  const entitlements = getPlanEntitlements(resolvedPlan);
  if (!entitlements.webhooksEnabled) {
    return {
      allowed: false,
      code: "WEBHOOKS_REQUIRE_PRO",
      plan: resolvedPlan,
      limit: 0,
      reason: "Webhooks require a paid plan.",
      upgradeHint: "Upgrade to Pro to enable webhook delivery."
    };
  }
  return { allowed: true };
}

/**
 * Feature gate for Managed Profiles. Every current plan has this enabled, so
 * the check cannot deny today; it exists so future plan changes gate in one
 * place without touching Managed Profiles enforcement semantics.
 */
export function checkManagedProfilesEnabled(plan: string | null | undefined): QuotaResult {
  const resolvedPlan = normalizePlan(plan);
  const entitlements = getPlanEntitlements(resolvedPlan);
  if (!entitlements.managedProfilesEnabled) {
    return {
      allowed: false,
      code: "MANAGED_PROFILES_REQUIRE_PAID_PLAN",
      plan: resolvedPlan,
      limit: 0,
      reason: "Managed Profiles require a paid plan.",
      upgradeHint: "Upgrade to Pro to use Managed Profiles."
    };
  }
  return { allowed: true };
}

/**
 * Feature gate for required managed profile mode. Required mode is currently
 * available on every plan (it predates the entitlement layer), so this cannot
 * deny today. It is intentionally not wired into policy validation to avoid
 * changing Managed Profiles enforcement semantics.
 */
export function checkRequiredManagedProfileMode(plan: string | null | undefined): QuotaResult {
  const resolvedPlan = normalizePlan(plan);
  const entitlements = getPlanEntitlements(resolvedPlan);
  if (!entitlements.requiredManagedProfileModeEnabled) {
    return {
      allowed: false,
      code: "REQUIRED_MODE_REQUIRES_PAID_PLAN",
      plan: resolvedPlan,
      limit: 0,
      reason: "Required managed profile mode requires a paid plan.",
      upgradeHint: "Upgrade to Pro to use required managed profile mode."
    };
  }
  return { allowed: true };
}

export function retentionSince(plan: string | null | undefined): Date {
  const entitlements = getPlanEntitlements(plan);
  return new Date(Date.now() - entitlements.logRetentionDays * 86_400_000);
}
