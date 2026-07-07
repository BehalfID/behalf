export const PRO_PLAN_PRICE_CENTS = 2000; // $20/month

/**
 * Internal plan identifiers.
 *
 * "pro" is the legacy Stripe-billed paid plan and keeps its historical limits.
 * "team" and "business" are internal tiers introduced ahead of Stripe/checkout
 * support; nothing assigns them automatically yet.
 */
export const PLANS = ["free", "pro", "team", "business", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

/** Unknown, missing, or invalid plan values resolve to the free plan (fail closed). */
export function normalizePlan(plan: string | null | undefined): Plan {
  return plan && (PLANS as readonly string[]).includes(plan) ? (plan as Plan) : "free";
}

/**
 * Central source of truth for what each plan can do.
 * Numeric limits use Infinity for "unlimited" (existing repo convention).
 */
export type PlanEntitlements = {
  maxBillableUsers: number;
  maxAgents: number;
  maxProtectedRepos: number;
  monthlyVerifications: number;
  logRetentionDays: number;
  webhooksEnabled: boolean;
  managedProfilesEnabled: boolean;
  requiredManagedProfileModeEnabled: boolean;
  pauseApprovalsEnabled: boolean;
  advancedAuditExportsEnabled: boolean;
};

export const PLAN_ENTITLEMENTS: Record<Plan, PlanEntitlements> = {
  free: {
    maxBillableUsers: 1,
    maxAgents: 3,
    maxProtectedRepos: 1,
    monthlyVerifications: 10_000,
    logRetentionDays: 7,
    webhooksEnabled: false,
    // Managed Profiles (including required mode and pause approvals) are
    // available to free workspaces today. These flags mirror that current
    // availability so introducing the entitlement layer does not change
    // Managed Profiles enforcement semantics.
    managedProfilesEnabled: true,
    requiredManagedProfileModeEnabled: true,
    pauseApprovalsEnabled: true,
    advancedAuditExportsEnabled: false
  },
  // Legacy Stripe-billed paid plan; numeric limits are unchanged from before
  // the entitlement layer existed.
  pro: {
    maxBillableUsers: 25,
    maxAgents: 50,
    maxProtectedRepos: 10,
    monthlyVerifications: 250_000,
    logRetentionDays: 90,
    webhooksEnabled: true,
    managedProfilesEnabled: true,
    requiredManagedProfileModeEnabled: true,
    pauseApprovalsEnabled: true,
    advancedAuditExportsEnabled: false
  },
  team: {
    maxBillableUsers: 25,
    maxAgents: 25,
    maxProtectedRepos: 10,
    monthlyVerifications: 250_000,
    logRetentionDays: 30,
    webhooksEnabled: true,
    managedProfilesEnabled: true,
    requiredManagedProfileModeEnabled: true,
    pauseApprovalsEnabled: true,
    advancedAuditExportsEnabled: false
  },
  business: {
    maxBillableUsers: 100,
    maxAgents: 250,
    maxProtectedRepos: 100,
    monthlyVerifications: 2_000_000,
    logRetentionDays: 180,
    webhooksEnabled: true,
    managedProfilesEnabled: true,
    requiredManagedProfileModeEnabled: true,
    pauseApprovalsEnabled: true,
    advancedAuditExportsEnabled: true
  },
  enterprise: {
    maxBillableUsers: Infinity,
    maxAgents: Infinity,
    maxProtectedRepos: Infinity,
    monthlyVerifications: Infinity,
    // Enterprise retention is custom per contract. It stays finite here so
    // retention-window date math (retentionSince) remains valid.
    logRetentionDays: 365,
    webhooksEnabled: true,
    managedProfilesEnabled: true,
    requiredManagedProfileModeEnabled: true,
    pauseApprovalsEnabled: true,
    advancedAuditExportsEnabled: true
  }
};

export function getPlanEntitlements(plan: string | null | undefined): PlanEntitlements {
  return PLAN_ENTITLEMENTS[normalizePlan(plan)];
}

export function getVerificationLimit(plan: string | null | undefined): number {
  return getPlanEntitlements(plan).monthlyVerifications;
}

export function getLogRetentionDays(plan: string | null | undefined): number {
  return getPlanEntitlements(plan).logRetentionDays;
}

export function isUnlimitedLimit(value: number | null | undefined): boolean {
  return typeof value !== "number" || !Number.isFinite(value);
}

/**
 * Formats a numeric limit for display; unlimited values render as "Unlimited".
 * Accepts null/undefined because Infinity serializes to null in JSON payloads.
 */
export function formatLimit(value: number | null | undefined): string {
  return isUnlimitedLimit(value) ? "Unlimited" : (value as number).toLocaleString();
}

/**
 * Legacy quota view, derived from PLAN_ENTITLEMENTS so there is a single
 * source of truth. Prefer getPlanEntitlements for new code.
 */
export type PlanQuotas = {
  maxAgents: number;
  verificationsPerMonth: number;
  webhooksEnabled: boolean;
  logRetentionDays: number;
};

function toQuotas(entitlements: PlanEntitlements): PlanQuotas {
  return {
    maxAgents: entitlements.maxAgents,
    verificationsPerMonth: entitlements.monthlyVerifications,
    webhooksEnabled: entitlements.webhooksEnabled,
    logRetentionDays: entitlements.logRetentionDays
  };
}

export const PLAN_QUOTAS: Record<Plan, PlanQuotas> = {
  free: toQuotas(PLAN_ENTITLEMENTS.free),
  pro: toQuotas(PLAN_ENTITLEMENTS.pro),
  team: toQuotas(PLAN_ENTITLEMENTS.team),
  business: toQuotas(PLAN_ENTITLEMENTS.business),
  enterprise: toQuotas(PLAN_ENTITLEMENTS.enterprise)
};

export function getQuotas(plan: Plan): PlanQuotas {
  return PLAN_QUOTAS[plan] ?? PLAN_QUOTAS.free;
}

export function isPaidPlan(plan: Plan): boolean {
  return normalizePlan(plan) !== "free";
}

export function verificationPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function isSameBillingPeriod(periodStart: Date, now = new Date()): boolean {
  const current = verificationPeriodStart(now);
  return periodStart.getUTCFullYear() === current.getUTCFullYear() &&
    periodStart.getUTCMonth() === current.getUTCMonth();
}
