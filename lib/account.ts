import { ensureAccountMembership } from "@/lib/delegatedAuth";
import { createPublicId } from "@/lib/ids";
import { createAccount, findAccount } from "@/lib/repositories/accounts";
import { listAgents, updateAgents } from "@/lib/repositories/agents";
import { updatePermissions } from "@/lib/repositories/permissions";
import { updateUser } from "@/lib/repositories/users";
import { updateLogs } from "@/lib/repositories/verificationLogs";
import { assignSlugWithDuplicateRetry } from "@/lib/workspaceSlugServer";

export const DEFAULT_ACCOUNT_NAME = "Prototype Admin";

export async function createDeveloperAccount(userId: string, email: string) {
  const name = email.split("@")[0]?.trim() || email;
  const accountId = createPublicId("acct");
  // Omit slug entirely so the sparse unique index does not see slug:null.
  // Permanent slug is assigned at onboarding completion — never from the email local part.
  await createAccount({ accountId, name } as never);
  const account = await findAccount({ accountId });
  if (!account) {
    throw new Error("Failed to create developer account.");
  }
  await updateUser(userId, { primaryAccountId: account.accountId });
  await ensureAccountMembership(userId, account.accountId);
  return account;
}

export async function getDefaultAccount() {
  let account = await findAccount({ name: DEFAULT_ACCOUNT_NAME });
  if (!account) {
    const accountId = createPublicId("acct");
    await assignSlugWithDuplicateRetry(DEFAULT_ACCOUNT_NAME, accountId, async (candidate) => {
      await createAccount({
        accountId,
        name: DEFAULT_ACCOUNT_NAME,
        slug: candidate
      } as never);
    });
    account = await findAccount({ accountId });
    if (!account) {
      account = await findAccount({ name: DEFAULT_ACCOUNT_NAME });
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
  await updateAgents(
    { $or: [{ accountId: { $exists: false } }, { accountId: null }] },
    { $set: { accountId } }
  );

  const agents = await listAgents({ accountId }, { select: "agentId accountId" });
  await Promise.all(
    agents.map((agent) =>
      Promise.all([
        updatePermissions(
          {
            agentId: agent.agentId,
            $or: [{ accountId: { $exists: false } }, { accountId: null }]
          },
          { $set: { accountId: agent.accountId } }
        ),
        updateLogs(
          {
            agentId: agent.agentId,
            $or: [{ accountId: { $exists: false } }, { accountId: null }]
          },
          { $set: { accountId: agent.accountId } }
        )
      ])
    )
  );

  return accountId;
}
