import { BILLABLE_WORKSPACE_ROLES, type WorkspaceRole } from "@/lib/authority";
import AccountInvite from "@/models/AccountInvite";
import AccountMembership, { type AccountMembershipDocument } from "@/models/AccountMembership";
import { isMongoDuplicateKeyError } from "@/lib/repositories/errors";
import { lazyModelAdapter } from "@/lib/repositories/mongoModelAdapter";

export type MembershipLean = {
  membershipId: string;
  accountId: string;
  userId: string;
  role: string;
  createdAt?: Date;
};

export type PendingInviteLean = {
  inviteId: string;
  email: string;
  role: string;
  invitedBy: string;
  createdAt?: Date;
};

export async function countBillableSeatsByAccountId(accountId: string) {
  return AccountMembership.countDocuments({
    accountId,
    role: { $in: [...BILLABLE_WORKSPACE_ROLES] }
  });
}

export async function findMembershipByAccountAndUser(
  accountId: string,
  userId: string
): Promise<MembershipLean | null> {
  return AccountMembership.findOne({ accountId, userId }).lean();
}

export async function findMembershipsByAccountId(accountId: string): Promise<MembershipLean[]> {
  return AccountMembership.find({ accountId }).sort({ createdAt: 1 }).lean();
}

export async function createMembership(input: {
  membershipId: string;
  accountId: string;
  userId: string;
  role: WorkspaceRole;
}): Promise<AccountMembershipDocument> {
  return AccountMembership.create(input);
}

export async function updateMembershipRole(
  membershipId: string,
  accountId: string,
  role: string
) {
  return AccountMembership.updateOne({ membershipId, accountId }, { $set: { role } });
}

export async function deleteMembership(membershipId: string, accountId: string) {
  return AccountMembership.deleteOne({ membershipId, accountId });
}

export async function findMembershipByUserAndAccount(
  userId: string,
  accountId: string
): Promise<MembershipLean | null> {
  return AccountMembership.findOne({ userId, accountId }).lean();
}

/**
 * Atomically provision the primary-account OWNER membership. A duplicate-key
 * race is resolved by returning the membership created by the winning request.
 */
export async function ensureOwnerMembership(
  userId: string,
  accountId: string,
  membershipId: string
): Promise<MembershipLean | null> {
  try {
    return await AccountMembership.findOneAndUpdate(
      { userId, accountId },
      {
        $setOnInsert: {
          membershipId,
          userId,
          accountId,
          role: "OWNER"
        }
      },
      { upsert: true, returnDocument: "after" }
    ).lean();
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      const existing = await findMembershipByUserAndAccount(userId, accountId);
      if (existing) return existing;
    }
    throw error;
  }
}

export async function createMembershipOrFindExisting(input: {
  membershipId: string;
  accountId: string;
  userId: string;
  role: WorkspaceRole;
}): Promise<MembershipLean> {
  try {
    const created = await AccountMembership.create(input);
    if (created && typeof (created as { toObject?: () => MembershipLean }).toObject === "function") {
      return (created as { toObject: () => MembershipLean }).toObject();
    }
    return created as unknown as MembershipLean;
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      const existing = await findMembershipByAccountAndUser(input.accountId, input.userId);
      if (existing) return existing;
    }
    throw error;
  }
}

export async function findInviteByTokenHash(tokenHash: string) {
  return AccountInvite.findOne({ inviteTokenHash: tokenHash })
    .select("+inviteTokenHash +inviteTokenExpiresAt")
    .lean();
}

export async function acceptInvite(inviteId: string, userId: string) {
  return AccountInvite.updateOne(
    { inviteId, status: "pending" },
    { $set: { status: "accepted", acceptedAt: new Date(), acceptedByUserId: userId } }
  );
}

export async function revokeInvite(accountId: string, inviteId: string) {
  return AccountInvite.updateOne({ inviteId, accountId, status: "pending" }, { $set: { status: "revoked" } });
}

export async function findPendingInvitesByAccountId(accountId: string): Promise<PendingInviteLean[]> {
  return AccountInvite.find({ accountId, status: "pending" }).sort({ createdAt: -1 }).lean();
}

export async function upsertPendingInvite(
  accountId: string,
  email: string,
  update: {
    role: string;
    invitedBy: string;
    inviteTokenHash: string;
    inviteTokenExpiresAt: Date;
    inviteId: string;
  }
): Promise<PendingInviteLean> {
  const doc = await AccountInvite.findOneAndUpdate(
    { accountId, email, status: "pending" },
    {
      $set: {
        role: update.role,
        invitedBy: update.invitedBy,
        inviteTokenHash: update.inviteTokenHash,
        inviteTokenExpiresAt: update.inviteTokenExpiresAt
      },
      $setOnInsert: {
        inviteId: update.inviteId,
        accountId,
        email,
        status: "pending"
      }
    },
    { upsert: true, returnDocument: "after" }
  ).lean();
  return doc as PendingInviteLean;
}

export async function findMembershipsByUserId(userId: string): Promise<MembershipLean[]> {
  return AccountMembership.find({ userId }).sort({ createdAt: 1 }).lean();
}

export async function deleteMembershipsByAccountId(accountId: string) {
  return AccountMembership.deleteMany({ accountId });
}

export async function deleteMembershipById(membershipId: string) {
  return AccountMembership.deleteOne({ membershipId });
}

export async function countMembershipsByAccountExcludingUser(accountId: string, userId: string) {
  return AccountMembership.countDocuments({ accountId, userId: { $ne: userId } });
}

export async function deleteInvitesByAccountId(accountId: string) {
  return AccountInvite.deleteMany({ accountId });
}

export async function markInviteAccepted(inviteId: string, userId: string, options?: { pendingOnly?: boolean }) {
  const filter: Record<string, unknown> = { inviteId };
  if (options?.pendingOnly !== false) {
    filter.status = "pending";
  }
  return AccountInvite.updateOne(filter, {
    $set: { status: "accepted", acceptedAt: new Date(), acceptedByUserId: userId }
  });
}

export const membershipModel = lazyModelAdapter(() => AccountMembership);
export const inviteModel = lazyModelAdapter(() => AccountInvite);
