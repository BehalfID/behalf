import { BILLABLE_WORKSPACE_ROLES, type WorkspaceRole } from "@/lib/authority";
import AccountInvite from "@/models/AccountInvite";
import AccountMembership, { type AccountMembershipDocument } from "@/models/AccountMembership";

type MembershipLean = {
  membershipId: string;
  accountId: string;
  userId: string;
  role: string;
  createdAt?: Date;
};

type PendingInviteLean = {
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

export async function findMembershipsByUserId(userId: string): Promise<MembershipLean[]> {
  return AccountMembership.find({ userId }).sort({ createdAt: 1 }).lean();
}

export async function findMembershipAccountIdsByUserId(userId: string): Promise<string[]> {
  const memberships = await AccountMembership.find({ userId }).select("accountId").lean();
  return memberships.map((membership) => membership.accountId);
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
