import Account from "@/models/Account";
import type { AccountDocument } from "@/models/Account";
import { translateDuplicateKey } from "@/lib/repositories/errors";
import { lazyModelMethod } from "@/lib/repositories/mongoModelAdapter";

export type AccountLean = AccountDocument;

export async function findAccountById(accountId: string) {
  return Account.findOne({ accountId });
}

export async function findAccountByIdLean(
  accountId: string,
  select?: string
): Promise<Pick<AccountDocument, "accountId" | "name" | "slug" | "companyName"> | null> {
  const query = Account.findOne({ accountId });
  if (select) {
    query.select(select);
  } else {
    query.select("accountId name slug companyName");
  }
  return query.lean();
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
  const query = Account.findOne({ slug: normalized });
  if (select) {
    query.select(select);
  } else {
    query.select("accountId name slug companyName");
  }
  return query.lean();
}

/** Read one account with an optional Mongo filter and projection. */
export async function findAccount(
  filter: Partial<Pick<AccountDocument, "accountId" | "slug" | "name" | "stripeCustomerId">> &
    Record<string, unknown>,
  select?: string
): Promise<AccountLean | null> {
  const query = Account.findOne(filter);
  if (select) query.select(select);
  return query.lean();
}

export async function listAccounts(
  filter: Record<string, unknown>,
  select?: string
): Promise<AccountLean[]> {
  const query = Account.find(filter);
  if (select) query.select(select);
  return query.lean();
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

/** Mongo query primitives for routes that need an exact model query shape. */
export function createAccountDocument(input: Partial<AccountDocument>) {
  return Account.create(input);
}

export function findAccounts(filter: Record<string, unknown> = {}) {
  return Account.find(filter);
}

export function findOneAccount(filter: Record<string, unknown>) {
  return Account.findOne(filter);
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
