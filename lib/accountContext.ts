import Account from "@/models/Account";
import AccountMembership from "@/models/AccountMembership";
import DeveloperSession from "@/models/DeveloperSession";
import { isWorkspaceRole, type WorkspaceRole } from "@/lib/authority";

export type UserAccountSummary = {
  accountId: string;
  name: string;
  role: WorkspaceRole;
  isPrimary: boolean;
};

export async function listUserAccounts(
  userId: string,
  primaryAccountId: string | null | undefined
): Promise<UserAccountSummary[]> {
  const memberships = await AccountMembership.find({ userId }).sort({ createdAt: 1 }).lean();
  if (memberships.length === 0) return [];

  const accountIds = memberships.map((membership) => membership.accountId);
  const accounts = await Account.find({ accountId: { $in: accountIds } })
    .select("accountId name")
    .lean();
  const nameByAccountId = new Map(accounts.map((account) => [account.accountId, account.name]));

  return memberships.map((membership) => ({
    accountId: membership.accountId,
    name: nameByAccountId.get(membership.accountId) ?? membership.accountId,
    role: isWorkspaceRole(membership.role) ? membership.role : "VIEWER",
    isPrimary: membership.accountId === primaryAccountId
  }));
}

export async function resolveActiveAccountId(
  userId: string,
  options: {
    sessionActiveAccountId?: string | null;
    sessionId?: string;
    primaryAccountId?: string | null;
  }
): Promise<string | null> {
  const memberships = await AccountMembership.find({ userId }).select("accountId").lean();
  const memberAccountIds = new Set(memberships.map((membership) => membership.accountId));

  if (
    options.sessionActiveAccountId &&
    !memberAccountIds.has(options.sessionActiveAccountId) &&
    options.sessionId
  ) {
    await DeveloperSession.updateOne(
      { sessionId: options.sessionId, userId },
      { $unset: { activeAccountId: "" } }
    );
  }

  if (options.sessionActiveAccountId && memberAccountIds.has(options.sessionActiveAccountId)) {
    return options.sessionActiveAccountId;
  }

  if (options.primaryAccountId && memberAccountIds.has(options.primaryAccountId)) {
    return options.primaryAccountId;
  }

  if (memberships.length > 0) {
    return memberships[0]?.accountId ?? null;
  }

  return options.primaryAccountId ?? null;
}

export async function switchActiveAccount(
  userId: string,
  sessionId: string,
  accountId: string
): Promise<{ ok: true; accountId: string } | { error: string }> {
  const membership = await AccountMembership.findOne({ userId, accountId }).lean();
  if (!membership) {
    return { error: "You do not have access to that workspace." };
  }

  const account = await Account.findOne({ accountId }).lean();
  if (!account) {
    return { error: "Workspace account not found." };
  }

  await DeveloperSession.updateOne({ sessionId, userId }, { $set: { activeAccountId: accountId } });
  return { ok: true, accountId };
}
