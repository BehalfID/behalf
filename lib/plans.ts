export const PRO_PLAN_PRICE_CENTS = 4900; // $49/month

export const PLANS = ["free", "pro", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export type PlanQuotas = {
  maxAgents: number;
  verificationsPerMonth: number;
  webhooksEnabled: boolean;
  logRetentionDays: number;
};

export const PLAN_QUOTAS: Record<Plan, PlanQuotas> = {
  free: {
    maxAgents: 5,
    verificationsPerMonth: 10_000,
    webhooksEnabled: false,
    logRetentionDays: 7
  },
  pro: {
    maxAgents: 50,
    verificationsPerMonth: 250_000,
    webhooksEnabled: true,
    logRetentionDays: 90
  },
  enterprise: {
    maxAgents: Infinity,
    verificationsPerMonth: Infinity,
    webhooksEnabled: true,
    logRetentionDays: 365
  }
};

export function getQuotas(plan: Plan): PlanQuotas {
  return PLAN_QUOTAS[plan] ?? PLAN_QUOTAS.free;
}

export function isPaidPlan(plan: Plan): boolean {
  return plan === "pro" || plan === "enterprise";
}

export function verificationPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function isSameBillingPeriod(periodStart: Date, now = new Date()): boolean {
  const current = verificationPeriodStart(now);
  return periodStart.getUTCFullYear() === current.getUTCFullYear() &&
    periodStart.getUTCMonth() === current.getUTCMonth();
}
