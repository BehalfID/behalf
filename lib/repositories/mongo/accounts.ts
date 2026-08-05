import Account from "@/models/Account";
import type { AccountDocument } from "@/models/Account";
import AccountPlanGrant from "@/models/AccountPlanGrant";
import type { AccountPlanGrantDocument } from "@/models/AccountPlanGrant";
import { translateDuplicateKey } from "@/lib/repositories/errors";
import { lazyModelMethod, selectLean } from "@/lib/repositories/mongoModelAdapter";
import type { ComplimentaryPlan, PlanGrantAction, PlanGrantActorType } from "@/lib/planGrants";
import type { Plan } from "@/lib/plans";

export type AccountLean = AccountDocument;

export type AccountPlanGrantLean = AccountPlanGrantDocument;

/** One entry in the append-only complimentary-plan ledger. */
export type AccountPlanGrantRecord = {
  grantId: string;
  accountId: string;
  action: PlanGrantAction;
  /** Plan awarded; null for a revoke. */
  plan: ComplimentaryPlan | null;
  previousPlan: ComplimentaryPlan | null;
  /** `account.plan` at the moment of the change — the Stripe-owned value. */
  billingPlanAtChange: Plan;
  reason: string;
  /** null means the grant does not expire (lifetime). */
  expiresAt: Date | null;
  actor: string;
  actorType: PlanGrantActorType;
  metadata?: Record<string, unknown>;
};

export type ComplimentaryPlanAssignment = {
  plan: ComplimentaryPlan;
  reason: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt: Date | null;
};

export async function findAccountById(accountId: string) {
  return Account.findOne({ accountId });
}

export async function findAccountByIdLean(
  accountId: string,
  select?: string
): Promise<Pick<AccountDocument, "accountId" | "name" | "slug" | "companyName"> | null> {
  return selectLean(Account.findOne({ accountId }), select ?? "accountId name slug companyName");
}

export async function findAccountBySlug(slug: string) {
  return Account.findOne({ slug });
}

export async function findAccountBySlugLean(
  slug: string,
  select?: string
): Promise<Pick<AccountDocument, "accountId" | "name" | "slug" | "companyName"> | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return selectLean(Account.findOne({ slug: normalized }), select ?? "accountId name slug companyName");
}

/** Read one account with an optional Mongo filter and projection. */
export async function findAccount(
  filter: Partial<Pick<AccountDocument, "accountId" | "slug" | "name" | "stripeCustomerId">> &
    Record<string, unknown>,
  select?: string
): Promise<AccountLean | null> {
  return selectLean(Account.findOne(filter), select);
}

export async function listAccounts(
  filter: Record<string, unknown>,
  select?: string
): Promise<AccountLean[]> {
  return selectLean(Account.find(filter), select);
}

export async function createAccount(input: Omit<AccountDocument, "_id" | "createdAt" | "updatedAt">) {
  try {
    return await Account.create(input);
  } catch (error) {
    translateDuplicateKey(error, "An account with this ID or workspace slug already exists.");
  }
}

export async function updateAccount(
  accountId: string,
  update: Record<string, unknown>
) {
  try {
    return await Account.updateOne({ accountId }, { $set: update });
  } catch (error) {
    translateDuplicateKey(error, "An account with this workspace slug already exists.");
  }
}

export async function findAccountAndUpdate(
  accountId: string,
  update: Record<string, unknown>
): Promise<AccountLean | null> {
  try {
    return await Account.findOneAndUpdate({ accountId }, { $set: update }, { new: true }).lean();
  } catch (error) {
    translateDuplicateKey(error, "An account with this workspace slug already exists.");
  }
}

export async function countAccounts(filter: Record<string, unknown> = {}) {
  return Account.countDocuments(filter);
}

export async function resetVerificationPeriod(accountId: string, periodStart: Date) {
  return Account.updateOne(
    { accountId },
    { $set: { verificationCount: 1, verificationPeriodStart: periodStart } }
  );
}

export async function incrementVerificationCount(accountId: string) {
  return Account.updateOne({ accountId }, { $inc: { verificationCount: 1 } });
}

/**
 * Write a complimentary plan grant.
 *
 * Deliberately narrow: it touches the five complimentary fields and nothing
 * else, so it can never be repurposed into a general plan editor and can never
 * write `plan` or any Stripe field. Callers go through
 * `lib/complimentaryPlans.ts`, which also records the ledger entry.
 */
export async function setComplimentaryPlan(
  accountId: string,
  assignment: ComplimentaryPlanAssignment
) {
  return Account.updateOne(
    { accountId },
    {
      $set: {
        complimentaryPlan: assignment.plan,
        complimentaryPlanReason: assignment.reason,
        complimentaryPlanGrantedBy: assignment.grantedBy,
        complimentaryPlanGrantedAt: assignment.grantedAt,
        complimentaryPlanExpiresAt: assignment.expiresAt
      }
    }
  );
}

/** Clear a complimentary grant. The ledger entry is what preserves the history. */
export async function clearComplimentaryPlan(accountId: string) {
  return Account.updateOne(
    { accountId },
    {
      $set: {
        complimentaryPlan: null,
        complimentaryPlanReason: null,
        complimentaryPlanGrantedBy: null,
        complimentaryPlanGrantedAt: null,
        complimentaryPlanExpiresAt: null
      }
    }
  );
}

/** Append a ledger entry. Entries are never updated or deleted. */
export async function createAccountPlanGrant(record: AccountPlanGrantRecord) {
  try {
    return await AccountPlanGrant.create(record);
  } catch (error) {
    translateDuplicateKey(error, "A plan grant entry with this ID already exists.");
  }
}

/** Ledger history for one account, newest first. */
export async function listAccountPlanGrants(
  accountId: string,
  limit = 50
): Promise<AccountPlanGrantLean[]> {
  return AccountPlanGrant.find({ accountId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<AccountPlanGrantLean[]>();
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function createAccountDocument(input: Partial<AccountDocument>) {
  return Account.create(input);
}

export function findAccounts(filter: Record<string, unknown> = {}) {
  return Account.find(filter);
}

export function findOneAccount(filter: Record<string, unknown>) {
  return selectLean(Account.findOne(filter));
}

export function findOneAndUpdateAccount(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options?: Record<string, unknown>
) {
  return Account.findOneAndUpdate(filter, update, options);
}

export function updateAccountByFilter(filter: Record<string, unknown>, update: Record<string, unknown>) {
  return Account.updateOne(filter, update);
}

export function countAccountDocuments(filter: Record<string, unknown> = {}) {
  return Account.countDocuments(filter);
}

/** Accounts with SSO enabled+enforced that list this email domain. */
export async function findAccountsEnforcingSsoForDomain(domain: string) {
  return Account.find({
    "sso.enabled": true,
    "sso.enforce": true,
    "sso.allowedEmailDomains": domain
  })
    .select("accountId plan complimentaryPlan complimentaryPlanExpiresAt sso")
    .lean();
}

/** SSO-enabled accounts among the given IDs that list this email domain. */
export async function findAccountsWithSsoForDomain(accountIds: string[], domain: string) {
  if (accountIds.length === 0) return [];
  return Account.find({
    accountId: { $in: accountIds },
    "sso.enabled": true,
    "sso.allowedEmailDomains": domain
  })
    .select("accountId plan complimentaryPlan complimentaryPlanExpiresAt sso")
    .lean();
}

export const accountRepository = {
  create: createAccountDocument,
  find: findAccounts,
  findOne: findOneAccount,
  findOneAndUpdate: findOneAndUpdateAccount,
  updateOne: updateAccountByFilter,
  countDocuments: countAccountDocuments
};

/** Legacy query-shaped adapters for callers being migrated from models. */
export const findOne = lazyModelMethod(() => Account, "findOne");
export const find = lazyModelMethod(() => Account, "find");
export const create = lazyModelMethod(() => Account, "create");
export const updateOne = lazyModelMethod(() => Account, "updateOne");
export const deleteOne = lazyModelMethod(() => Account, "deleteOne");
