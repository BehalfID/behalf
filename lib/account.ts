import { ensureAccountMembership } from "@/lib/delegatedAuth";
import { createPublicId } from "@/lib/ids";
import { generateUniqueWorkspaceSlug } from "@/lib/workspaceSlugServer";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import DeveloperUser from "@/models/DeveloperUser";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";

export const DEFAULT_ACCOUNT_NAME = "Prototype Admin";

export async function createDeveloperAccount(userId: string, email: string) {
  const name = email.split("@")[0]?.trim() || email;
  const accountId = createPublicId("acct");
  const slug = await generateUniqueWorkspaceSlug(name, accountId);
  const account = await Account.create({
    accountId,
    name,
    slug
  });
  await DeveloperUser.updateOne({ userId }, { $set: { primaryAccountId: account.accountId } });
  await ensureAccountMembership(userId, account.accountId);
  return account;
}

export async function getDefaultAccount() {
  let account = await Account.findOne({ name: DEFAULT_ACCOUNT_NAME });
  if (!account) {
    const accountId = createPublicId("acct");
    const slug = await generateUniqueWorkspaceSlug(DEFAULT_ACCOUNT_NAME, accountId);
    account = await Account.create({
      accountId,
      name: DEFAULT_ACCOUNT_NAME,
      slug
    });
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
