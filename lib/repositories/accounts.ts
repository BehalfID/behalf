/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/accounts";
import { delegate } from "@/lib/repositories/delegate";

export type {
  AccountLean,
} from "@/lib/repositories/mongo/accounts";

export {
  accountRepository,
  findOne,
  find,
  create,
  updateOne,
  deleteOne,
} from "@/lib/repositories/mongo/accounts";

export const findAccountById = delegate("accounts", "findAccountById", mongo.findAccountById);
export const findAccountByIdLean = delegate("accounts", "findAccountByIdLean", mongo.findAccountByIdLean);
export const findAccountBySlug = delegate("accounts", "findAccountBySlug", mongo.findAccountBySlug);
export const findAccountBySlugLean = delegate("accounts", "findAccountBySlugLean", mongo.findAccountBySlugLean);
export const findAccount = delegate("accounts", "findAccount", mongo.findAccount);
export const listAccounts = delegate("accounts", "listAccounts", mongo.listAccounts);
export const createAccount = delegate("accounts", "createAccount", mongo.createAccount);
export const updateAccount = delegate("accounts", "updateAccount", mongo.updateAccount);
export const findAccountAndUpdate = delegate("accounts", "findAccountAndUpdate", mongo.findAccountAndUpdate);
export const countAccounts = delegate("accounts", "countAccounts", mongo.countAccounts);
export const resetVerificationPeriod = delegate("accounts", "resetVerificationPeriod", mongo.resetVerificationPeriod);
export const incrementVerificationCount = delegate("accounts", "incrementVerificationCount", mongo.incrementVerificationCount);
export const createAccountDocument = delegate("accounts", "createAccountDocument", mongo.createAccountDocument);
export const findAccounts = delegate("accounts", "findAccounts", mongo.findAccounts);
export const findOneAccount = delegate("accounts", "findOneAccount", mongo.findOneAccount);
export const findOneAndUpdateAccount = delegate("accounts", "findOneAndUpdateAccount", mongo.findOneAndUpdateAccount);
export const updateAccountByFilter = delegate("accounts", "updateAccountByFilter", mongo.updateAccountByFilter);
export const countAccountDocuments = delegate("accounts", "countAccountDocuments", mongo.countAccountDocuments);
