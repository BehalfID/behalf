import { ensureAccountMembership } from "@/lib/delegatedAuth";
import { createPublicId } from "@/lib/ids";
import { assignSlugWithDuplicateRetry } from "@/lib/workspaceSlugServer";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import DeveloperUser from "@/models/DeveloperUser";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";

export const DEFAULT_ACCOUNT_NAME = "Prototype Admin";

export async function createDeveloperAccount(userId: string, email: string) {
  const name = email.split("@")[0]?.trim() || email;
  const accountId = createPublicId("acct");
  // Slug is assigned at onboarding completion — not from the email local part.
  await Account.create({ accountId, name, slug: null });
  const account = await Account.findOne({ accountId });
  if (!account) {
    throw new Error("Failed to create developer account.");
  }
  await DeveloperUser.updateOne({ userId }, { $set: { primaryAccountId: account.accountId } });
  await ensureAccountMembership(userId, account.accountId);
  return account;
}

export async function getDefaultAccount() {
  let account = await Account.findOne({ name: DEFAULT_ACCOUNT_NAME });
  if (!account) {
    const accountId = createPublicId("acct");
    await assignSlugWithDuplicateRetry(DEFAULT_ACCOUNT_NAME, accountId, async (candidate) => {
      await Account.create({
        accountId,
        name: DEFAULT_ACCOUNT_NAME,
        slug: candidate
      });
    });
    account = await Account.findOne({ accountId });
    if (!account) {
      account = await Account.findOne({ name: DEFAULT_ACCOUNT_NAME });
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
  await Agent.updateMany(
    { $or: [{ accountId: { $exists: false } }, { accountId: null }] },
    { $set: { accountId } }
  );

  const agents = await Agent.find({ accountId }).select("agentId accountId").lean();
  await Promise.all(
    agents.map((agent) =>
      Promise.all([
        Permission.updateMany(
          {
            agentId: agent.agentId,
            $or: [{ accountId: { $exists: false } }, { accountId: null }]
          },
          { $set: { accountId: agent.accountId } }
        ),
        VerificationLog.updateMany(
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
