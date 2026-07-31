import {
  countOtherMemberships,
  deleteAccountCascade,
  deleteDeveloperUserCredentials,
  deleteMembershipForDeletion,
  findDeveloperUserForDeletion,
  findMembershipsForDeletion
} from "@/lib/repositories/accountDeletion";

export type AccountDeletionResult =
  | { ok: true; deletedUserId: string; deletedAccountIds: string[] }
  | { ok: false; error: string; status: number };

/**
 * Permanently delete a developer user and sole-owned workspace data.
 * Shared workspaces keep the account; only this user's membership is removed.
 */
export async function deleteDeveloperUser(userId: string): Promise<AccountDeletionResult> {
  const user = await findDeveloperUserForDeletion(userId);
  if (!user) {
    return { ok: false, error: "Account not found.", status: 404 };
  }

  const memberships = await findMembershipsForDeletion(userId);
  const deletedAccountIds: string[] = [];

  for (const membership of memberships) {
    const otherMembers = await countOtherMemberships(membership.accountId, userId);

    if (otherMembers > 0) {
      await deleteMembershipForDeletion(membership.membershipId);
      continue;
    }

    await deleteAccountCascade(membership.accountId, userId);
    deletedAccountIds.push(membership.accountId);
  }

  await deleteDeveloperUserCredentials(userId);

  return { ok: true, deletedUserId: userId, deletedAccountIds };
}
