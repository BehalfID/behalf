import { PLANS, type Plan } from "@/lib/plans";

export const MANUAL_ASSIGNABLE_PLANS = ["team", "business", "enterprise"] as const;
/**
 * Administrative non-Stripe upgrade targets only.
 * `free` and `pro` are billing-state values managed by signup defaults and Stripe webhooks;
 * this script is not a general-purpose billing editor.
 */
export type ManualAssignablePlan = (typeof MANUAL_ASSIGNABLE_PLANS)[number];

export const ACCOUNT_PLAN_OVERRIDE_REFUSAL_REASON =
  "Refusing to change account plan because the database does not clearly look non-production. " +
  "Use a local/dev/test/staging database, or set ALLOW_ACCOUNT_PLAN_OVERRIDE=1 only if you intentionally want to override this guard.";

export const STRIPE_LINKED_CONFIRM_REFUSAL =
  "Account has Stripe billing linkage. Stripe webhook events may control or later overwrite the account plan. " +
  "Re-run with --confirm --force to apply a manual plan assignment without changing Stripe fields.";

export const STRIPE_WEBHOOK_OVERWRITE_WARNING =
  "WARNING: This account has Stripe billing linkage. Future Stripe webhook events may overwrite the manually assigned plan. " +
  "Stripe customer, subscription, and status fields were left unchanged.";

export type SetAccountPlanArgs = {
  accountId: string;
  plan: ManualAssignablePlan;
  dryRun: boolean;
  confirm: boolean;
  force: boolean;
};

export type AccountPlanSnapshot = {
  accountId: string;
  name: string;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
};

export type SetAccountPlanAudit = {
  timestamp: string;
  mode: "dry-run" | "confirm";
  accountId: string;
  accountName: string;
  previousPlan: string;
  nextPlan: ManualAssignablePlan;
  stripeLinked: boolean;
  forced: boolean;
  applied: boolean;
};

export type SetAccountPlanEnv = {
  NODE_ENV?: string;
  ALLOW_ACCOUNT_PLAN_OVERRIDE?: string;
  MONGODB_URI?: string;
  OPERATOR?: string;
};

export function isManualAssignablePlan(plan: string): plan is ManualAssignablePlan {
  return (MANUAL_ASSIGNABLE_PLANS as readonly string[]).includes(plan);
}

export function isValidAccountId(accountId: string) {
  return /^acct_[A-Za-z0-9_-]+$/.test(accountId);
}

export function accountIsStripeLinked(account: AccountPlanSnapshot) {
  return Boolean(account.stripeCustomerId?.trim()) || Boolean(account.stripeSubscriptionId?.trim());
}

export function parseSetAccountPlanArgs(args: string[]): SetAccountPlanArgs {
  const options: Partial<SetAccountPlanArgs> = {
    force: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--account-id": {
        const value = args[index + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("--account-id requires a value.");
        }
        options.accountId = value;
        index += 1;
        break;
      }
      case "--plan": {
        const value = args[index + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("--plan requires a value.");
        }
        if (!isManualAssignablePlan(value)) {
          throw new Error(
            `--plan must be one of: ${MANUAL_ASSIGNABLE_PLANS.join(", ")}. Received: ${value}`
          );
        }
        options.plan = value;
        index += 1;
        break;
      }
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--confirm":
        options.confirm = true;
        break;
      case "--force":
        options.force = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.accountId) {
    throw new Error("--account-id is required.");
  }
  if (!isValidAccountId(options.accountId)) {
    throw new Error(`--account-id must match acct_<id>. Received: ${options.accountId}`);
  }
  if (!options.plan) {
    throw new Error("--plan is required.");
  }
  if (options.dryRun && options.confirm) {
    throw new Error("Use either --dry-run or --confirm, not both.");
  }
  if (!options.dryRun && !options.confirm) {
    throw new Error("Specify one mode: --dry-run or --confirm.");
  }
  if (options.force && options.dryRun) {
    throw new Error("--force can only be used with --confirm.");
  }

  return {
    accountId: options.accountId,
    plan: options.plan,
    dryRun: Boolean(options.dryRun),
    confirm: Boolean(options.confirm),
    force: Boolean(options.force)
  };
}

export function extractDatabaseName(mongoUri?: string) {
  if (!mongoUri?.trim()) return null;
  const withoutQuery = mongoUri.split("?")[0] ?? "";
  const segments = withoutQuery.split("/").filter(Boolean);
  return segments.at(-1) ?? null;
}

export function splitDatabaseNameSegments(databaseName: string) {
  return databaseName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isNonProductionDatabaseName(databaseName: string | null) {
  if (!databaseName) return false;
  const segments = splitDatabaseNameSegments(databaseName);
  if (segments.some((segment) => PRODUCTION_DATABASE_SEGMENTS.has(segment))) {
    return false;
  }
  return segments.some((segment) => NON_PRODUCTION_DATABASE_SEGMENTS.has(segment));
}

const NON_PRODUCTION_DATABASE_SEGMENTS = new Set([
  "local",
  "dev",
  "development",
  "test",
  "testing",
  "staging",
  "preview",
  "sandbox"
]);

const PRODUCTION_DATABASE_SEGMENTS = new Set(["prod", "production", "live"]);

export function canRunAccountPlanOverride(env: SetAccountPlanEnv) {
  if (env.ALLOW_ACCOUNT_PLAN_OVERRIDE === "1") {
    return { allowed: true as const };
  }

  const databaseName = extractDatabaseName(env.MONGODB_URI);
  if (!databaseName || !isNonProductionDatabaseName(databaseName)) {
    return { allowed: false as const, reason: ACCOUNT_PLAN_OVERRIDE_REFUSAL_REASON };
  }

  return { allowed: true as const };
}

export function buildPlanUpdate(plan: ManualAssignablePlan) {
  return { plan } as const;
}

export function validatePlanChange(
  account: AccountPlanSnapshot,
  args: SetAccountPlanArgs
): { ok: true } | { ok: false; reason: string } {
  if (account.accountId !== args.accountId) {
    return { ok: false, reason: "Account ID mismatch while preparing plan change." };
  }

  if (account.plan === args.plan) {
    return {
      ok: false,
      reason: `Account ${args.accountId} is already on the ${args.plan} plan.`
    };
  }

  if (args.confirm && accountIsStripeLinked(account) && !args.force) {
    return { ok: false, reason: STRIPE_LINKED_CONFIRM_REFUSAL };
  }

  return { ok: true };
}

export function createAuditEntry(input: {
  args: SetAccountPlanArgs;
  account: AccountPlanSnapshot;
  applied: boolean;
}): SetAccountPlanAudit {
  return {
    timestamp: new Date().toISOString(),
    mode: input.args.dryRun ? "dry-run" : "confirm",
    accountId: input.account.accountId,
    accountName: input.account.name,
    previousPlan: normalizePlanForAudit(input.account.plan),
    nextPlan: input.args.plan,
    stripeLinked: accountIsStripeLinked(input.account),
    forced: input.args.force,
    applied: input.applied
  };
}

function normalizePlanForAudit(plan: string): Plan {
  return (PLANS as readonly string[]).includes(plan) ? (plan as Plan) : "free";
}

export function formatAuditEntry(audit: SetAccountPlanAudit, operator?: string) {
  const lines = [
    "Account plan administration audit",
    `  timestamp: ${audit.timestamp}`,
    `  operator: ${operator ?? "unknown"}`,
    `  mode: ${audit.mode}`,
    `  accountId: ${audit.accountId}`,
    `  accountName: ${audit.accountName}`,
    `  previousPlan: ${audit.previousPlan}`,
    `  nextPlan: ${audit.nextPlan}`,
    `  stripeLinked: ${audit.stripeLinked ? "yes" : "no"}`,
    `  forced: ${audit.forced ? "yes" : "no"}`,
    `  applied: ${audit.applied ? "yes" : "no"}`
  ];

  if (audit.stripeLinked) {
    lines.push(`  warning: ${STRIPE_WEBHOOK_OVERWRITE_WARNING}`);
    if (audit.mode === "dry-run") {
      lines.push(
        "  note: Confirm without --force will be refused while Stripe billing linkage remains on this account."
      );
    }
  }

  return lines.join("\n");
}
