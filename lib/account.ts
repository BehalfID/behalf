import { ensureAccountMembership } from "@/lib/delegatedAuth";
import { createPublicId } from "@/lib/ids";
import { assignSlugWithDuplicateRetry } from "@/lib/workspaceSlugServer";
import {
  createAccount,
  findAccountById,
  findAccountByName
} from "@/lib/repositories/accounts";
import {
  backfillMissingAgentAccountIds,
  findAgentsByAccountIdLean
} from "@/lib/repositories/agents";
import { backfillPermissionAccountId } from "@/lib/repositories/permissions";
import { backfillVerificationLogAccountId } from "@/lib/repositories/verificationLogs";
import DeveloperUser from "@/models/DeveloperUser";

export const DEFAULT_ACCOUNT_NAME = "Prototype Admin";

export async function createDeveloperAccount(userId: string, email: string) {
  const name = email.split("@")[0]?.trim() || email;
  const accountId = createPublicId("acct");
  // Omit slug entirely so the sparse unique index does not see slug:null.
  // Permanent slug is assigned at onboarding completion — never from the email local part.
  await createAccount({ accountId, name });
  const account = await findAccountById(accountId);
  if (!account) {
    throw new Error("Failed to create developer account.");
  }
  await DeveloperUser.updateOne({ userId }, { $set: { primaryAccountId: account.accountId } });
  await ensureAccountMembership(userId, account.accountId);
  return account;
}

export async function getDefaultAccount() {
  let account = await findAccountByName(DEFAULT_ACCOUNT_NAME);
  if (!account) {
    const accountId = createPublicId("acct");
    await assignSlugWithDuplicateRetry(DEFAULT_ACCOUNT_NAME, accountId, async (candidate) => {
      await createAccount({
        accountId,
        name: DEFAULT_ACCOUNT_NAME,
        slug: candidate
      });
    });
    account = await findAccountById(accountId);
    if (!account) {
      account = await findAccountByName(DEFAULT_ACCOUNT_NAME);
    }
    if (!account) {
      throw new Error("Failed to create default account.");
    }
  }

  return account;
}

export async function getDefaultAccountId() {
  const account = await getDefaultAccount();
  return account.accountId;
}

export async function backfillDefaultAccountId() {
  const accountId = await getDefaultAccountId();
  await backfillMissingAgentAccountIds(accountId);

  const agents = await findAgentsByAccountIdLean(accountId);
  await Promise.all(
    agents.map((agent) =>
      Promise.all([
        backfillPermissionAccountId(agent.agentId, agent.accountId as string),
        backfillVerificationLogAccountId(agent.agentId, agent.accountId as string)
      ])
    )
  );

  return accountId;
}
