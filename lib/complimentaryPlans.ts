/**
 * The only sanctioned way to change a complimentary plan grant.
 *
 * Two invariants this module exists to hold:
 *
 *  1. **No unaudited entitlement change.** The ledger entry is written before
 *     the account state changes. There is no cross-backend transaction in this
 *     codebase, so one of the two writes has to go first; writing the ledger
 *     first means the worst case is a recorded change that failed to apply
 *     (visible, reconcilable, and reported as an error), never an entitlement
 *     change nobody can account for.
 *
 *  2. **Stripe cannot reach these fields.** Grants are written through the
 *     narrow `setComplimentaryPlan` / `clearComplimentaryPlan` repository
 *     methods, which touch the five complimentary columns and nothing else.
 *     Billing code writes `plan` and the Stripe columns and never calls these.
 */
import { createPublicId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import {
  activeComplimentaryPlan,
  billingPlan,
  complimentaryGrantView,
  effectivePlan,
  isComplimentaryPlan,
  isPlanGrantActorType,
  planEntitlementRegressions,
  type ComplimentaryGrantView,
  type ComplimentaryPlan,
  type PlanGrantActorType
} from "@/lib/planGrants";
import type { Plan } from "@/lib/plans";
import {
  clearComplimentaryPlan,
  createAccountPlanGrant,
  findAccountById,
  listAccountPlanGrants,
  setComplimentaryPlan
} from "@/lib/repositories/accounts";

export const MAX_GRANT_REASON_LENGTH = 500;

export type GrantComplimentaryPlanInput = {
  accountId: string;
  plan: ComplimentaryPlan;
  /** Why this workspace is comped. Required — an unexplained grant is not auditable. */
  reason: string;
  /** null or omitted means the grant does not expire (lifetime). */
  expiresAt?: Date | null;
  actor: string;
  actorType: PlanGrantActorType;
  metadata?: Record<string, unknown>;
};

export type RevokeComplimentaryPlanInput = {
  accountId: string;
  reason: string;
  actor: string;
  actorType: PlanGrantActorType;
  metadata?: Record<string, unknown>;
};

export type ComplimentaryPlanChange = {
  grantId: string;
  accountId: string;
  action: "grant" | "revoke";
  previousPlan: ComplimentaryPlan | null;
  plan: ComplimentaryPlan | null;
  billingPlanAtChange: Plan;
  effectivePlanBefore: Plan;
  effectivePlanAfter: Plan;
  expiresAt: Date | null;
  /**
   * Entitlements the granted plan rates lower than the billing plan. Reported,
   * never enforced: `effectiveEntitlements` takes the per-field maximum, so
   * nothing is actually lost — but an operator granting "team" to a paying
   * "pro" workspace should know the tier is not uniformly higher.
   */
  regressionsVersusBilling: string[];
};

export class ComplimentaryPlanError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ComplimentaryPlanError";
    this.code = code;
  }
}

function requireReason(reason: string): string {
  const trimmed = reason?.trim() ?? "";
  if (!trimmed) {
    throw new ComplimentaryPlanError(
      "REASON_REQUIRED",
      "A reason is required so the grant ledger stays auditable."
    );
  }
  if (trimmed.length > MAX_GRANT_REASON_LENGTH) {
    throw new ComplimentaryPlanError(
      "REASON_TOO_LONG",
      `Reason must be ${MAX_GRANT_REASON_LENGTH} characters or fewer.`
    );
  }
  return trimmed;
}

function requireActor(actor: string, actorType: PlanGrantActorType): string {
  const trimmed = actor?.trim() ?? "";
  if (!trimmed) {
    throw new ComplimentaryPlanError(
      "ACTOR_REQUIRED",
      "An actor is required so the grant ledger records who authorized it."
    );
  }
  if (!isPlanGrantActorType(actorType)) {
    throw new ComplimentaryPlanError("ACTOR_TYPE_INVALID", `Unknown actor type: ${actorType}`);
  }
  return trimmed;
}

async function requireAccount(accountId: string) {
  const account = await findAccountById(accountId);
  if (!account) {
    throw new ComplimentaryPlanError("ACCOUNT_NOT_FOUND", `Account not found: ${accountId}`);
  }
  return account;
}

/**
 * Append the ledger entry, then apply the state change.
 *
 * If the state change fails the ledger entry is left in place and the error
 * names it, because a recorded-but-unapplied change is discoverable
 * (`getComplimentaryPlanStatus` surfaces the mismatch) while an applied-but-
 * unrecorded change is not.
 */
async function writeLedgerThenApply(
  entry: Parameters<typeof createAccountPlanGrant>[0],
  apply: () => Promise<unknown>
) {
  await createAccountPlanGrant(entry);
  try {
    await apply();
  } catch (error) {
    logger.error("complimentary_plan_apply_failed", {
      grantId: entry.grantId,
      accountId: entry.accountId,
      action: entry.action,
      error: (error as { message?: string })?.message
    });
    throw new ComplimentaryPlanError(
      "APPLY_FAILED",
      `Ledger entry ${entry.grantId} was recorded but the account update failed. ` +
        "The workspace still holds its previous entitlements; reconcile before retrying."
    );
  }
}

export async function grantComplimentaryPlan(
  input: GrantComplimentaryPlanInput,
  now: Date = new Date()
): Promise<ComplimentaryPlanChange> {
  if (!isComplimentaryPlan(input.plan)) {
    throw new ComplimentaryPlanError(
      "PLAN_NOT_GRANTABLE",
      `Complimentary plan must be one of pro, team, business, enterprise. Received: ${input.plan}`
    );
  }

  const reason = requireReason(input.reason);
  const actor = requireActor(input.actor, input.actorType);
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    throw new ComplimentaryPlanError(
      "EXPIRY_IN_PAST",
      "Grant expiry must be in the future; an already-expired grant awards nothing."
    );
  }

  const account = await requireAccount(input.accountId);
  const billing = billingPlan(account);
  const previousPlan = activeComplimentaryPlan(account, now);
  const effectivePlanBefore = effectivePlan(account, now);

  const grantId = createPublicId("cgrant");
  await writeLedgerThenApply(
    {
      grantId,
      accountId: input.accountId,
      action: "grant",
      plan: input.plan,
      previousPlan,
      billingPlanAtChange: billing,
      reason,
      expiresAt,
      actor,
      actorType: input.actorType,
      metadata: input.metadata
    },
    () =>
      setComplimentaryPlan(input.accountId, {
        plan: input.plan,
        reason,
        grantedBy: actor,
        grantedAt: now,
        expiresAt
      })
  );

  const after = {
    plan: account.plan,
    complimentaryPlan: input.plan,
    complimentaryPlanExpiresAt: expiresAt
  };

  logger.info("complimentary_plan_granted", {
    grantId,
    accountId: input.accountId,
    plan: input.plan,
    billingPlan: billing,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    actorType: input.actorType
  });

  return {
    grantId,
    accountId: input.accountId,
    action: "grant",
    previousPlan,
    plan: input.plan,
    billingPlanAtChange: billing,
    effectivePlanBefore,
    effectivePlanAfter: effectivePlan(after, now),
    expiresAt,
    regressionsVersusBilling: planEntitlementRegressions(billing, input.plan)
  };
}

export async function revokeComplimentaryPlan(
  input: RevokeComplimentaryPlanInput,
  now: Date = new Date()
): Promise<ComplimentaryPlanChange> {
  const reason = requireReason(input.reason);
  const actor = requireActor(input.actor, input.actorType);

  const account = await requireAccount(input.accountId);
  const stored = account.complimentaryPlan;
  if (!isComplimentaryPlan(stored)) {
    throw new ComplimentaryPlanError(
      "NO_ACTIVE_GRANT",
      `Account ${input.accountId} has no complimentary plan to revoke.`
    );
  }

  const billing = billingPlan(account);
  const effectivePlanBefore = effectivePlan(account, now);
  const grantId = createPublicId("cgrant");

  await writeLedgerThenApply(
    {
      grantId,
      accountId: input.accountId,
      action: "revoke",
      plan: null,
      previousPlan: stored,
      billingPlanAtChange: billing,
      reason,
      expiresAt: null,
      actor,
      actorType: input.actorType,
      metadata: input.metadata
    },
    () => clearComplimentaryPlan(input.accountId)
  );

  logger.info("complimentary_plan_revoked", {
    grantId,
    accountId: input.accountId,
    previousPlan: stored,
    billingPlan: billing,
    actorType: input.actorType
  });

  return {
    grantId,
    accountId: input.accountId,
    action: "revoke",
    previousPlan: stored,
    plan: null,
    billingPlanAtChange: billing,
    effectivePlanBefore,
    effectivePlanAfter: billing,
    expiresAt: null,
    regressionsVersusBilling: []
  };
}

export type ComplimentaryPlanStatus = {
  accountId: string;
  accountName: string;
  billingPlan: Plan;
  effectivePlan: Plan;
  grant: ComplimentaryGrantView | null;
  stripeLinked: boolean;
  ledger: Array<{
    grantId: string;
    action: string;
    plan: string | null;
    previousPlan: string | null;
    billingPlanAtChange: string;
    reason: string;
    expiresAt: Date | null;
    actor: string;
    actorType: string;
    createdAt: Date | null;
  }>;
  /**
   * True when the newest ledger entry does not describe the account's current
   * grant state — the signature of a ledger write that was never applied.
   */
  ledgerMismatch: boolean;
};

export async function getComplimentaryPlanStatus(
  accountId: string,
  now: Date = new Date()
): Promise<ComplimentaryPlanStatus> {
  const account = await requireAccount(accountId);
  const rows = await listAccountPlanGrants(accountId, 50);

  const ledger = (rows as Array<Record<string, unknown>>).map((row) => ({
    grantId: String(row.grantId ?? ""),
    action: String(row.action ?? ""),
    plan: (row.plan as string | null) ?? null,
    previousPlan: (row.previousPlan as string | null) ?? null,
    billingPlanAtChange: String(row.billingPlanAtChange ?? ""),
    reason: String(row.reason ?? ""),
    expiresAt: (row.expiresAt as Date | null) ?? null,
    actor: String(row.actor ?? ""),
    actorType: String(row.actorType ?? ""),
    createdAt: (row.createdAt as Date | null) ?? null
  }));

  const storedPlan = isComplimentaryPlan(account.complimentaryPlan)
    ? account.complimentaryPlan
    : null;
  const newest = ledger[0];
  const expectedFromLedger = newest
    ? newest.action === "grant"
      ? newest.plan
      : null
    : null;

  return {
    accountId,
    accountName: account.name,
    billingPlan: billingPlan(account),
    effectivePlan: effectivePlan(account, now),
    grant: complimentaryGrantView(account, now),
    stripeLinked: Boolean(account.stripeCustomerId) || Boolean(account.stripeSubscriptionId),
    ledger,
    ledgerMismatch: Boolean(newest) && expectedFromLedger !== storedPlan
  };
}
