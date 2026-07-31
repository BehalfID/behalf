import { isWorkspaceRole, type WorkspaceRole } from "@/lib/authority";
import { createPublicId } from "@/lib/ids";
import { generateSecureToken, hashEmailToken, normalizeEmail } from "@/lib/developerAuth";
import { checkSeatLimit, type QuotaResult } from "@/lib/quota";
import { switchActiveAccount } from "@/lib/accountContext";
import { findAccountByIdLean } from "@/lib/repositories/accounts";
import { DuplicateKeyError } from "@/lib/repositories/errors";
import {
  acceptInvite as acceptInviteRecord,
  createMembershipOrFindExisting,
  findInviteByTokenHash,
  findMembershipByAccountAndUser,
  markInviteAccepted,
  revokeInvite as revokeInviteRecord
} from "@/lib/repositories/memberships";

export const INVITE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export type InvitePreview = {
  status: "pending" | "accepted" | "revoked" | "expired";
  email: string;
  role: WorkspaceRole;
  accountId: string;
  accountName: string;
  invitedBy: string;
  expiresAt: string | null;
};

export type AcceptInviteResult =
  | {
      ok: true;
      accountId: string;
      membershipId: string;
      role: WorkspaceRole;
      alreadyAccepted?: boolean;
      alreadyMember?: boolean;
    }
  | { error: "invalid_token" | "expired" | "revoked" | "email_mismatch"; invitedEmail?: string }
  | { error: "seat_limit_reached"; quota: QuotaResult };

export function createInviteTokenPair() {
  const token = generateSecureToken();
  return {
    token,
    tokenHash: hashEmailToken(token),
    expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS)
  };
}

export function buildInviteAcceptUrl(token: string, baseUrl: string) {
  const origin = baseUrl.replace(/\/$/, "");
  return `${origin}/invite/${encodeURIComponent(token)}`;
}

export async function findInviteByToken(token: string) {
  const tokenHash = hashEmailToken(token);
  return findInviteByTokenHash(tokenHash);
}

function resolveInviteStatus(
  invite: {
    status: string;
    inviteTokenExpiresAt?: Date | null;
  },
  now = new Date()
): InvitePreview["status"] {
  if (invite.status === "accepted") return "accepted";
  if (invite.status === "revoked") return "revoked";
  if (invite.inviteTokenExpiresAt && invite.inviteTokenExpiresAt <= now) return "expired";
  return "pending";
}

export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  const invite = await findInviteByToken(token);
  if (!invite) return null;

  const account = await findAccountByIdLean(invite.accountId, "accountId name");
  const status = resolveInviteStatus(invite);

  return {
    status,
    email: invite.email,
    role: isWorkspaceRole(invite.role) ? invite.role : "VIEWER",
    accountId: invite.accountId,
    accountName: account?.name ?? "Workspace",
    invitedBy: invite.invitedBy,
    expiresAt: invite.inviteTokenExpiresAt?.toISOString() ?? null
  };
}

export async function acceptInvite(
  token: string,
  userId: string,
  userEmail: string,
  options?: { sessionId?: string }
): Promise<AcceptInviteResult> {
  const invite = await findInviteByToken(token);
  if (!invite) {
    return { error: "invalid_token" };
  }

  const status = resolveInviteStatus(invite);
  if (status === "revoked") {
    return { error: "revoked" };
  }
  if (status === "expired") {
    return { error: "expired" };
  }

  const invitedEmail = normalizeEmail(invite.email);
  const normalizedUserEmail = normalizeEmail(userEmail);
  if (normalizedUserEmail !== invitedEmail) {
    return { error: "email_mismatch", invitedEmail };
  }

  const role = isWorkspaceRole(invite.role) ? invite.role : "VIEWER";

  if (status === "accepted") {
    const existingMembership = await findMembershipByAccountAndUser(invite.accountId, userId);
    if (existingMembership) {
      if (options?.sessionId) {
        await switchActiveAccount(userId, options.sessionId, invite.accountId);
      }
      return {
        ok: true,
        accountId: invite.accountId,
        membershipId: existingMembership.membershipId,
        role,
        alreadyAccepted: true,
        alreadyMember: true
      };
    }
  }

  const existingMembership = await findMembershipByAccountAndUser(invite.accountId, userId);

  if (existingMembership) {
    if (invite.status === "pending") {
      await markInviteAccepted(invite.inviteId, userId);
    }
    if (options?.sessionId) {
      await switchActiveAccount(userId, options.sessionId, invite.accountId);
    }
    return {
      ok: true,
      accountId: invite.accountId,
      membershipId: existingMembership.membershipId,
      role: isWorkspaceRole(existingMembership.role) ? existingMembership.role : role,
      alreadyMember: true
    };
  }

  // The invite is about to create a new membership; block only here so that
  // users who are already members (above) are never affected by seat limits.
  const seatCheck = await checkSeatLimit(invite.accountId, role);
  if (!seatCheck.allowed) {
    return { error: "seat_limit_reached", quota: seatCheck };
  }

  const membershipId = createPublicId("mbr");
  try {
    await createMembershipOrFindExisting({
      membershipId,
      accountId: invite.accountId,
      userId,
      role
    });
  } catch (error) {
    if (error instanceof DuplicateKeyError || isMongoDuplicate(error)) {
      const racedMembership = await findMembershipByAccountAndUser(invite.accountId, userId);
      if (!racedMembership) throw error;
      if (options?.sessionId) {
        await switchActiveAccount(userId, options.sessionId, invite.accountId);
      }
      return {
        ok: true,
        accountId: invite.accountId,
        membershipId: racedMembership.membershipId,
        role: isWorkspaceRole(racedMembership.role) ? racedMembership.role : role,
        alreadyMember: true
      };
    }
    throw error;
  }

  await acceptInviteRecord(invite.inviteId, userId);

  if (options?.sessionId) {
    await switchActiveAccount(userId, options.sessionId, invite.accountId);
  }

  return {
    ok: true,
    accountId: invite.accountId,
    membershipId,
    role
  };
}

function isMongoDuplicate(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function revokeInvite(accountId: string, inviteId: string) {
  const result = await revokeInviteRecord(accountId, inviteId);
  return (result.modifiedCount ?? 0) > 0;
}
