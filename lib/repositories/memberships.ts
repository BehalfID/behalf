/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/memberships";
import { delegate } from "@/lib/repositories/delegate";

export type {
  MembershipLean,
  PendingInviteLean,
} from "@/lib/repositories/mongo/memberships";

export {
  membershipModel,
  inviteModel,
} from "@/lib/repositories/mongo/memberships";

export const countBillableSeatsByAccountId = delegate("memberships", "countBillableSeatsByAccountId", mongo.countBillableSeatsByAccountId);
export const findMembershipByAccountAndUser = delegate("memberships", "findMembershipByAccountAndUser", mongo.findMembershipByAccountAndUser);
export const findMembershipsByAccountId = delegate("memberships", "findMembershipsByAccountId", mongo.findMembershipsByAccountId);
export const createMembership = delegate("memberships", "createMembership", mongo.createMembership);
export const updateMembershipRole = delegate("memberships", "updateMembershipRole", mongo.updateMembershipRole);
export const deleteMembership = delegate("memberships", "deleteMembership", mongo.deleteMembership);
export const findMembershipByUserAndAccount = delegate("memberships", "findMembershipByUserAndAccount", mongo.findMembershipByUserAndAccount);
export const ensureOwnerMembership = delegate("memberships", "ensureOwnerMembership", mongo.ensureOwnerMembership);
export const createMembershipOrFindExisting = delegate("memberships", "createMembershipOrFindExisting", mongo.createMembershipOrFindExisting);
export const findInviteByTokenHash = delegate("memberships", "findInviteByTokenHash", mongo.findInviteByTokenHash);
export const acceptInvite = delegate("memberships", "acceptInvite", mongo.acceptInvite);
export const revokeInvite = delegate("memberships", "revokeInvite", mongo.revokeInvite);
export const findPendingInvitesByAccountId = delegate("memberships", "findPendingInvitesByAccountId", mongo.findPendingInvitesByAccountId);
export const upsertPendingInvite = delegate("memberships", "upsertPendingInvite", mongo.upsertPendingInvite);
export const findMembershipsByUserId = delegate("memberships", "findMembershipsByUserId", mongo.findMembershipsByUserId);
export const deleteMembershipsByAccountId = delegate("memberships", "deleteMembershipsByAccountId", mongo.deleteMembershipsByAccountId);
export const deleteMembershipById = delegate("memberships", "deleteMembershipById", mongo.deleteMembershipById);
export const countMembershipsByAccountExcludingUser = delegate("memberships", "countMembershipsByAccountExcludingUser", mongo.countMembershipsByAccountExcludingUser);
export const deleteInvitesByAccountId = delegate("memberships", "deleteInvitesByAccountId", mongo.deleteInvitesByAccountId);
export const markInviteAccepted = delegate("memberships", "markInviteAccepted", mongo.markInviteAccepted);
