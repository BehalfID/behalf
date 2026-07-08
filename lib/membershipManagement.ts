import {
  AUTHORITY_LEVELS,
  getAuthorityLevelForRole,
  isWorkspaceRole,
  type WorkspaceRole
} from "@/lib/authority";
import {
  canDelegateRole,
  canManageMembers,
  canViewMembers,
  roleDelegationForbidden,
  type WorkspaceActor
} from "@/lib/delegatedAuth";
import { createPublicId } from "@/lib/ids";
import { normalizeEmail } from "@/lib/developerAuth";
import { buildInviteAcceptUrl, createInviteTokenPair } from "@/lib/inviteAcceptance";
import { checkSeatLimit, quotaErrorDetails } from "@/lib/quota";
import {
  createMembership,
  deleteMembership,
  findMembershipByAccountAndUser,
  findMembershipsByAccountId,
  findPendingInvitesByAccountId,
  updateMembershipRole,
  upsertPendingInvite
} from "@/lib/repositories";
import { jsonError } from "@/lib/responses";
import DeveloperSession from "@/models/DeveloperSession";
import DeveloperUser from "@/models/DeveloperUser";

export type MemberRecord = {
  membershipId: string;
  userId: string;
  email: string | null;
  role: WorkspaceRole;
  status: "active";
  createdAt?: Date;
};

export type InviteRecord = {
  inviteId: string;
  email: string;
  role: WorkspaceRole;
  status: "pending";
  invitedBy: string;
  createdAt?: Date;
};

export function countOwners(memberships: Array<{ role: string }>) {
  return memberships.filter((member) => member.role === "OWNER").length;
}

export function canRemoveMember(
  actor: WorkspaceActor,
  target: { role: WorkspaceRole; userId: string },
  memberships: Array<{ role: string; userId: string }>
): boolean {
  if (actor.userId === target.userId) return false;
  if (target.role === "OWNER" && actor.role !== "OWNER") return false;
  if (target.role === "OWNER" && countOwners(memberships) <= 1) return false;
  if (actor.role === "OWNER") return true;
  if (actor.role === "ENGINEERING_LEAD") {
    return getAuthorityLevelForRole(target.role) < AUTHORITY_LEVELS.ENGINEERING_LEAD;
  }
  return false;
}

export function canUpdateMemberRole(
  actor: WorkspaceActor,
  target: { role: WorkspaceRole; userId: string; membershipId: string },
  nextRole: WorkspaceRole,
  memberships: Array<{ role: string; userId: string; membershipId: string }>
): boolean {
  if (!canManageMembers(actor)) return false;
  if (!canDelegateRole(actor, nextRole)) return false;
  if (target.role === "OWNER" && actor.role !== "OWNER") return false;
  if (target.userId === actor.userId && getAuthorityLevelForRole(nextRole) < actor.authorityLevel) {
    if (actor.role === "OWNER" && countOwners(memberships) <= 1) return false;
  }
  if (target.role === "OWNER" && nextRole !== "OWNER" && countOwners(memberships) <= 1) {
    return false;
  }
  return true;
}

export async function listAccountMembers(accountId: string) {
  const memberships = await findMembershipsByAccountId(accountId);
  const userIds = memberships.map((member) => member.userId);
  const users = userIds.length
    ? await DeveloperUser.find({ userId: { $in: userIds } })
        .select("userId email")
        .lean()
    : [];
  const emailByUserId = new Map(users.map((user) => [user.userId, user.email]));

  const members: MemberRecord[] = memberships.map((member) => ({
    membershipId: member.membershipId,
    userId: member.userId,
    email: emailByUserId.get(member.userId) ?? null,
    role: isWorkspaceRole(member.role) ? member.role : "VIEWER",
    status: "active",
    createdAt: member.createdAt
  }));

  const invites = await findPendingInvitesByAccountId(accountId);

  const pendingInvites: InviteRecord[] = invites.map((invite) => ({
    inviteId: invite.inviteId,
    email: invite.email,
    role: isWorkspaceRole(invite.role) ? invite.role : "VIEWER",
    status: "pending",
    invitedBy: invite.invitedBy,
    createdAt: invite.createdAt
  }));

  return { members, pendingInvites };
}

export async function addOrInviteMember(
  actor: WorkspaceActor,
  input: { email: string; role: WorkspaceRole },
  options?: { appBaseUrl?: string }
) {
  if (!canManageMembers(actor)) {
    return { error: roleDelegationForbidden() };
  }
  if (!canDelegateRole(actor, input.role)) {
    return { error: roleDelegationForbidden() };
  }

  const email = normalizeEmail(input.email);
  const existingUser = await DeveloperUser.findOne({ email }).select("userId email primaryAccountId").lean();

  if (existingUser) {
    const existingMembership = await findMembershipByAccountAndUser(
      actor.accountId,
      existingUser.userId
    );
    if (existingMembership) {
      return { error: "This user is already a member of the workspace." };
    }

    // Seat limits only block adding new billable members; existing members are
    // never removed or downgraded when a workspace is over its limit.
    const seatCheck = await checkSeatLimit(actor.accountId, input.role);
    if (!seatCheck.allowed) {
      return {
        error: jsonError(
          seatCheck.reason ?? "This workspace has reached its billable seat limit.",
          402,
          quotaErrorDetails(seatCheck)
        )
      };
    }

    const membership = await createMembership({
      membershipId: createPublicId("mbr"),
      accountId: actor.accountId,
      userId: existingUser.userId,
      role: input.role
    });

    return {
      member: {
        membershipId: membership.membershipId,
        userId: membership.userId,
        email: existingUser.email,
        role: input.role,
        status: "active" as const
      }
    };
  }

  const seatCheck = await checkSeatLimit(actor.accountId, input.role);
  if (!seatCheck.allowed) {
    return {
      error: jsonError(
        seatCheck.reason ?? "This workspace has reached its billable seat limit.",
        402,
        quotaErrorDetails(seatCheck)
      )
    };
  }

  const { token, tokenHash, expiresAt } = createInviteTokenPair();

  const invite = await upsertPendingInvite(actor.accountId, email, {
    role: input.role,
    invitedBy: actor.userId,
    inviteTokenHash: tokenHash,
    inviteTokenExpiresAt: expiresAt,
    inviteId: createPublicId("inv")
  });

  const baseUrl = options?.appBaseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const acceptUrl = baseUrl ? buildInviteAcceptUrl(token, baseUrl) : null;

  return {
    invite: {
      inviteId: invite.inviteId,
      email: invite.email,
      role: isWorkspaceRole(invite.role) ? invite.role : input.role,
      status: "pending" as const,
      invitedBy: invite.invitedBy,
      acceptUrl
    }
  };
}

export async function updateMemberRole(
  actor: WorkspaceActor,
  membershipId: string,
  nextRole: WorkspaceRole
) {
  const memberships = await findMembershipsByAccountId(actor.accountId);
  const target = memberships.find((member) => member.membershipId === membershipId);
  if (!target) return { error: "Member not found." };
  const targetRole = isWorkspaceRole(target.role) ? target.role : "VIEWER";
  if (
    !canUpdateMemberRole(
      actor,
      { role: targetRole, userId: target.userId, membershipId: target.membershipId },
      nextRole,
      memberships.map((member) => ({
        role: member.role,
        userId: member.userId,
        membershipId: member.membershipId
      }))
    )
  ) {
    return { error: roleDelegationForbidden() };
  }

  await updateMembershipRole(membershipId, actor.accountId, nextRole);
  return { ok: true };
}

export async function removeMember(actor: WorkspaceActor, membershipId: string) {
  const memberships = await findMembershipsByAccountId(actor.accountId);
  const target = memberships.find((member) => member.membershipId === membershipId);
  if (!target) return { error: "Member not found." };
  const targetRole = isWorkspaceRole(target.role) ? target.role : "VIEWER";
  if (
    !canRemoveMember(
      actor,
      { role: targetRole, userId: target.userId },
      memberships.map((member) => ({ role: member.role, userId: member.userId }))
    )
  ) {
    return { error: roleDelegationForbidden() };
  }

  await deleteMembership(membershipId, actor.accountId);
  await DeveloperSession.updateMany(
    { userId: target.userId, activeAccountId: actor.accountId },
    { $unset: { activeAccountId: "" } }
  );
  return { ok: true };
}

export function assertCanViewMembers(actor: WorkspaceActor) {
  return canViewMembers(actor) || canManageMembers(actor);
}
