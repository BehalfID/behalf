/**
 * Complimentary plan grants: entitlements a workspace holds without paying for
 * them, resolved independently of Stripe.
 *
 * Why this exists as its own concept rather than an edit to `account.plan`:
 * every Stripe webhook branch ends in an unconditional `$set: { plan }`, and
 * three of them set it to "free" (subscription deleted, invoice payment failed,
 * subscription updated to any non-active status). A comp written into
 * `account.plan` is therefore one webhook away from silent erasure, with no
 * record that it ever existed. The grant lives in columns billing code never
 * writes, so the overwrite is structurally impossible rather than merely
 * unlikely, and `account_plan_grants` records how the state was reached.
 *
 * A grant is strictly additive. `effectiveEntitlements` takes the per-field
 * maximum of the billing plan and the granted plan, so a grant can never reduce
 * what a workspace already pays for — even if a future entitlement matrix
 * temporarily regresses a field on a higher-ranked plan.
 */
import {
  PLANS,
  getPlanEntitlements,
  isUnlimitedLimit,
  normalizePlan,
  type Plan,
  type PlanEntitlements
} from "@/lib/plans";

/** Plans a complimentary grant may award; "free" would be a no-op grant. */
export const COMPLIMENTARY_PLANS = ["pro", "team", "business", "enterprise"] as const;
export type ComplimentaryPlan = (typeof COMPLIMENTARY_PLANS)[number];

export const PLAN_GRANT_ACTIONS = ["grant", "revoke"] as const;
export type PlanGrantAction = (typeof PLAN_GRANT_ACTIONS)[number];

export const PLAN_GRANT_ACTOR_TYPES = ["console_admin", "operator_script"] as const;
export type PlanGrantActorType = (typeof PLAN_GRANT_ACTOR_TYPES)[number];

/** Display ordering only. Entitlement resolution never relies on this. */
const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  pro: 1,
  team: 2,
  business: 3,
  enterprise: 4
};

export function isComplimentaryPlan(plan: unknown): plan is ComplimentaryPlan {
  return typeof plan === "string" && (COMPLIMENTARY_PLANS as readonly string[]).includes(plan);
}

export function isPlanGrantActorType(value: unknown): value is PlanGrantActorType {
  return typeof value === "string" && (PLAN_GRANT_ACTOR_TYPES as readonly string[]).includes(value);
}

/**
 * The minimum an account must expose for its plan to be resolved. Kept
 * structural so lean Mongo documents, Postgres rows and test fixtures all
 * satisfy it without conversion.
 */
export type PlanBearingAccount = {
  plan?: string | null;
  complimentaryPlan?: string | null;
  complimentaryPlanExpiresAt?: Date | string | null;
};

export type ComplimentaryGrantView = {
  plan: ComplimentaryPlan;
  reason: string | null;
  grantedBy: string | null;
  grantedAt: Date | null;
  expiresAt: Date | null;
  /** True when the grant exists but its expiry has passed. */
  expired: boolean;
};

type GrantDetailAccount = PlanBearingAccount & {
  complimentaryPlanReason?: string | null;
  complimentaryPlanGrantedBy?: string | null;
  complimentaryPlanGrantedAt?: Date | string | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The plan the workspace is paying for. Stripe owns this value. */
export function billingPlan(account: PlanBearingAccount | null | undefined): Plan {
  return normalizePlan(account?.plan);
}

/**
 * The granted plan, or null when there is no grant or it has expired.
 *
 * A grant with no expiry is a lifetime grant. An unrecognised stored value
 * resolves to null rather than to "free" — an unreadable grant must not silently
 * behave like a valid one.
 */
export function activeComplimentaryPlan(
  account: PlanBearingAccount | null | undefined,
  now: Date = new Date()
): ComplimentaryPlan | null {
  const plan = account?.complimentaryPlan;
  if (!isComplimentaryPlan(plan)) return null;

  const expiresAt = toDate(account?.complimentaryPlanExpiresAt);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return null;

  return plan;
}

export function hasActiveComplimentaryPlan(
  account: PlanBearingAccount | null | undefined,
  now: Date = new Date()
): boolean {
  return activeComplimentaryPlan(account, now) !== null;
}

/**
 * Full grant detail for admin surfaces and audit output. Returns a value for an
 * expired grant too — "expired last month" is information an operator needs,
 * whereas entitlement resolution must ignore it.
 */
export function complimentaryGrantView(
  account: GrantDetailAccount | null | undefined,
  now: Date = new Date()
): ComplimentaryGrantView | null {
  const plan = account?.complimentaryPlan;
  if (!isComplimentaryPlan(plan)) return null;

  const expiresAt = toDate(account?.complimentaryPlanExpiresAt);
  return {
    plan,
    reason: account?.complimentaryPlanReason?.trim() || null,
    grantedBy: account?.complimentaryPlanGrantedBy?.trim() || null,
    grantedAt: toDate(account?.complimentaryPlanGrantedAt),
    expiresAt,
    expired: Boolean(expiresAt && expiresAt.getTime() <= now.getTime())
  };
}

/**
 * Plan name to display. This is a label, not the entitlement source — use
 * `effectiveEntitlements` for anything that gates behaviour.
 */
export function effectivePlan(
  account: PlanBearingAccount | null | undefined,
  now: Date = new Date()
): Plan {
  const billing = billingPlan(account);
  const granted = activeComplimentaryPlan(account, now);
  if (!granted) return billing;
  return PLAN_RANK[granted] > PLAN_RANK[billing] ? granted : billing;
}

export type PlanSource = "billing" | "complimentary";

/**
 * Where the displayed plan comes from. "complimentary" only when the grant is
 * what raises the plan above billing — a comp that matches or sits below the
 * paid plan is not what the customer is getting.
 */
export function planSource(
  account: PlanBearingAccount | null | undefined,
  now: Date = new Date()
): PlanSource {
  const granted = activeComplimentaryPlan(account, now);
  if (!granted) return "billing";
  return PLAN_RANK[granted] > PLAN_RANK[billingPlan(account)] ? "complimentary" : "billing";
}

function maxLimit(a: number, b: number): number {
  if (isUnlimitedLimit(a) || isUnlimitedLimit(b)) return Infinity;
  return Math.max(a, b);
}

/**
 * The entitlements a workspace actually holds: the union of what it pays for
 * and what it was granted.
 *
 * Per-field max rather than "pick a plan" is what guarantees a grant is purely
 * additive. Without it, granting "team" to a paying "pro" workspace would cut
 * its agent limit from 50 to 25, because the plan matrix is not monotonic.
 */
export function effectiveEntitlements(
  account: PlanBearingAccount | null | undefined,
  now: Date = new Date()
): PlanEntitlements {
  const billing = getPlanEntitlements(billingPlan(account));
  const granted = activeComplimentaryPlan(account, now);
  if (!granted) return billing;

  const comp = getPlanEntitlements(granted);
  return {
    maxBillableUsers: maxLimit(billing.maxBillableUsers, comp.maxBillableUsers),
    maxAgents: maxLimit(billing.maxAgents, comp.maxAgents),
    maxProtectedRepos: maxLimit(billing.maxProtectedRepos, comp.maxProtectedRepos),
    monthlyVerifications: maxLimit(billing.monthlyVerifications, comp.monthlyVerifications),
    logRetentionDays: maxLimit(billing.logRetentionDays, comp.logRetentionDays),
    webhooksEnabled: billing.webhooksEnabled || comp.webhooksEnabled,
    managedProfilesEnabled: billing.managedProfilesEnabled || comp.managedProfilesEnabled,
    requiredManagedProfileModeEnabled:
      billing.requiredManagedProfileModeEnabled || comp.requiredManagedProfileModeEnabled,
    pauseApprovalsEnabled: billing.pauseApprovalsEnabled || comp.pauseApprovalsEnabled,
    advancedAuditExportsEnabled:
      billing.advancedAuditExportsEnabled || comp.advancedAuditExportsEnabled,
    googleWorkspaceSsoEnabled: billing.googleWorkspaceSsoEnabled || comp.googleWorkspaceSsoEnabled
  };
}

/**
 * Entitlements that plan `to` would lower relative to plan `from`.
 *
 * `effectiveEntitlements` already prevents a grant from taking anything away at
 * runtime; this reports the cases where that protection is doing work, so an
 * operator granting a nominally higher tier is told the granted plan is not
 * uniformly better. Purely informational — never a gate.
 */
export function planEntitlementRegressions(from: Plan, to: Plan): string[] {
  const before = getPlanEntitlements(from);
  const after = getPlanEntitlements(to);
  const regressions: string[] = [];

  for (const key of Object.keys(before) as Array<keyof PlanEntitlements>) {
    const previous = before[key];
    const next = after[key];
    if (typeof previous === "boolean" || typeof next === "boolean") {
      if (previous === true && next === false) regressions.push(key);
      continue;
    }
    if (isUnlimitedLimit(previous) && !isUnlimitedLimit(next)) {
      regressions.push(key);
      continue;
    }
    if (!isUnlimitedLimit(next) && next < previous) regressions.push(key);
  }

  return regressions;
}

/** Serializable summary for dashboard/billing payloads. */
export type EffectivePlanSummary = {
  plan: Plan;
  source: PlanSource;
  billingPlan: Plan;
  complimentaryPlan: ComplimentaryPlan | null;
  complimentaryPlanExpiresAt: string | null;
};

export function effectivePlanSummary(
  account: GrantDetailAccount | null | undefined,
  now: Date = new Date()
): EffectivePlanSummary {
  const granted = activeComplimentaryPlan(account, now);
  const expiresAt = granted ? toDate(account?.complimentaryPlanExpiresAt) : null;
  return {
    plan: effectivePlan(account, now),
    source: planSource(account, now),
    billingPlan: billingPlan(account),
    complimentaryPlan: granted,
    complimentaryPlanExpiresAt: expiresAt ? expiresAt.toISOString() : null
  };
}

/**
 * Billing-surface prop: non-null only when a grant is what raises the plan
 * above what the workspace pays for, so the UI never labels a paid plan as
 * complimentary.
 */
export function complimentaryBadge(
  account: PlanBearingAccount | null | undefined,
  now: Date = new Date()
): { plan: ComplimentaryPlan; expiresAt: string | null } | null {
  if (planSource(account, now) !== "complimentary") return null;
  const plan = activeComplimentaryPlan(account, now);
  if (!plan) return null;
  const expiresAt = toDate(account?.complimentaryPlanExpiresAt);
  return { plan, expiresAt: expiresAt ? expiresAt.toISOString() : null };
}

/** Guard for stored plan strings coming back from either backend. */
export function isKnownPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}
