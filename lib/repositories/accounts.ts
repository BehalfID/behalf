import Account from "@/models/Account";
import type { AccountDocument } from "@/models/Account";

export async function findAccountById(accountId: string) {
  return Account.findOne({ accountId });
}

export async function findAccountByIdLean(
  accountId: string,
  select?: string
): Promise<Pick<AccountDocument, "accountId" | "name"> | null> {
  const query = Account.findOne({ accountId });
  if (select) {
    query.select(select);
  }
  return query.lean();
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
