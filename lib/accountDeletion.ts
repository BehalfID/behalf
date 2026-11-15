import {
  countOtherMemberships,
  deleteAccountCascade,
  deleteDeveloperUserCredentials,
  deleteMembershipForDeletion,
  findDeveloperUserForDeletion,
  findMembershipsForDeletion
} from "@/lib/repositories/accountDeletion";
import { findMembershipsByAccountId } from "@/lib/repositories/memberships";
import { deleteEndpoints } from "@/lib/repositories/webhooks";

export const SOLE_OWNER_DELETION_ERROR =
  "You are the only owner of a workspace that has other members. Make another member an owner (or remove the other members) before deleting your account.";

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

  // Check every workspace before changing anything: deleting the only OWNER of
  // a shared workspace would leave its members with no one able to manage
  // billing, members or owner-only policy (removeMember refuses the same).
  const sharedAccountIds = new Set<string>();
  for (const membership of memberships) {
    const otherMembers = await countOtherMemberships(membership.accountId, userId);
    if (otherMembers === 0) continue;
    sharedAccountIds.add(membership.accountId);
    if (membership.role !== "OWNER") continue;
    const accountMembers = await findMembershipsByAccountId(membership.accountId);
    const otherOwners = accountMembers.filter(
      (member) => member.role === "OWNER" && member.userId !== userId
    ).length;
    if (otherOwners === 0) {
      return { ok: false, error: SOLE_OWNER_DELETION_ERROR, status: 409 };
    }
  }

  for (const membership of memberships) {
    if (sharedAccountIds.has(membership.accountId)) {
      await deleteMembershipForDeletion(membership.membershipId);
      // Mirror removeMember: the departing user's endpoints stop receiving
      // this workspace's events.
      await deleteEndpoints({ accountId: membership.accountId, developerUserId: userId });
      continue;
    }

    await deleteAccountCascade(membership.accountId, userId);
    deletedAccountIds.push(membership.accountId);
  }

  await deleteDeveloperUserCredentials(userId);

  return { ok: true, deletedUserId: userId, deletedAccountIds };
}
