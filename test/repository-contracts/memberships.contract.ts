import { expect, it } from "vitest";
import type { WorkspaceRole } from "@/lib/authority";
import { repositoryContractSuite } from "./contractHarness";

export type MembershipRecord = {
  membershipId: string;
  accountId: string;
  userId: string;
  role: string;
};

export type PendingInviteRecord = {
  inviteId: string;
  email: string;
  role: string;
  invitedBy: string;
};

export type MembershipRepositoryContract = {
  countBillableSeatsByAccountId: (accountId: string) => Promise<number>;
  findMembershipByAccountAndUser: (
    accountId: string,
    userId: string
  ) => Promise<MembershipRecord | null>;
  createMembership: (input: {
    membershipId: string;
    accountId: string;
    userId: string;
    role: WorkspaceRole;
  }) => Promise<unknown>;
  updateMembershipRole: (membershipId: string, accountId: string, role: string) => Promise<unknown>;
  deleteMembership: (membershipId: string, accountId: string) => Promise<unknown>;
  findPendingInvitesByAccountId: (accountId: string) => Promise<PendingInviteRecord[]>;
  upsertPendingInvite: (
    accountId: string,
    email: string,
    update: {
      role: string;
      invitedBy: string;
      inviteTokenHash: string;
      inviteTokenExpiresAt: Date;
      inviteId: string;
    }
  ) => Promise<PendingInviteRecord>;
};

export type MembershipContractDeps = MembershipRepositoryContract & {
  seedAccount: (accountId?: string) => Promise<{ accountId: string }>;
  seedAcceptedInvite: (accountId: string, email: string) => Promise<void>;
  countMembershipsByAccountId: (accountId: string) => Promise<number>;
  countInvitesByAccountId: (accountId: string) => Promise<number>;
  findInviteByEmail: (accountId: string, email: string) => Promise<{ inviteId: string; role: string } | null>;
};

export function makeMembershipRepositoryContract(
  name: string,
  factory: () => MembershipContractDeps | Promise<MembershipContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("countBillableSeatsByAccountId counts billable roles only", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_billable");

      await deps.createMembership({
        membershipId: "mbr_owner",
        accountId,
        userId: "dev_owner",
        role: "OWNER"
      });
      await deps.createMembership({
        membershipId: "mbr_engineer",
        accountId,
        userId: "dev_engineer",
        role: "ENGINEER"
      });
      await deps.createMembership({
        membershipId: "mbr_viewer",
        accountId,
        userId: "dev_viewer",
        role: "VIEWER"
      });

      const count = await deps.countBillableSeatsByAccountId(accountId);

      expect(count).toBe(2);
    });

    it("VIEWER does not count as billable", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_viewer_only");

      await deps.createMembership({
        membershipId: "mbr_viewer_only",
        accountId,
        userId: "dev_viewer_only",
        role: "VIEWER"
      });

      const count = await deps.countBillableSeatsByAccountId(accountId);

      expect(count).toBe(0);
    });

    it("findMembershipByAccountAndUser returns the expected membership", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_find_mbr");
      await deps.createMembership({
        membershipId: "mbr_find",
        accountId,
        userId: "dev_find",
        role: "SENIOR_ENGINEER"
      });

      const membership = await deps.findMembershipByAccountAndUser(accountId, "dev_find");

      expect(membership).not.toBeNull();
      expect(membership?.membershipId).toBe("mbr_find");
      expect(membership?.role).toBe("SENIOR_ENGINEER");
    });

    it("createMembership creates a membership with the requested role", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_create_mbr");

      await deps.createMembership({
        membershipId: "mbr_create",
        accountId,
        userId: "dev_create",
        role: "ENGINEERING_LEAD"
      });

      const membership = await deps.findMembershipByAccountAndUser(accountId, "dev_create");
      expect(membership?.role).toBe("ENGINEERING_LEAD");
    });

    it("updateMembershipRole changes only the target membership", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_update_mbr");
      await deps.createMembership({
        membershipId: "mbr_target",
        accountId,
        userId: "dev_target",
        role: "ENGINEER"
      });
      await deps.createMembership({
        membershipId: "mbr_other",
        accountId,
        userId: "dev_other",
        role: "ENGINEER"
      });

      await deps.updateMembershipRole("mbr_target", accountId, "SENIOR_ENGINEER");

      const target = await deps.findMembershipByAccountAndUser(accountId, "dev_target");
      const other = await deps.findMembershipByAccountAndUser(accountId, "dev_other");
      expect(target?.role).toBe("SENIOR_ENGINEER");
      expect(other?.role).toBe("ENGINEER");
    });

    it("deleteMembership removes only the target membership", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_delete_mbr");
      await deps.createMembership({
        membershipId: "mbr_delete_target",
        accountId,
        userId: "dev_delete_target",
        role: "ENGINEER"
      });
      await deps.createMembership({
        membershipId: "mbr_delete_keep",
        accountId,
        userId: "dev_delete_keep",
        role: "ENGINEER"
      });

      await deps.deleteMembership("mbr_delete_target", accountId);

      const deleted = await deps.findMembershipByAccountAndUser(accountId, "dev_delete_target");
      const kept = await deps.findMembershipByAccountAndUser(accountId, "dev_delete_keep");
      expect(deleted).toBeNull();
      expect(kept?.membershipId).toBe("mbr_delete_keep");
    });

    it("findPendingInvitesByAccountId returns only pending invites", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_pending_invites");
      const expiresAt = new Date("2026-12-31T00:00:00.000Z");

      await deps.upsertPendingInvite(accountId, "pending@example.com", {
        role: "ENGINEER",
        invitedBy: "dev_owner",
        inviteTokenHash: "hash_pending",
        inviteTokenExpiresAt: expiresAt,
        inviteId: "inv_pending"
      });
      await deps.seedAcceptedInvite(accountId, "accepted@example.com");

      const invites = await deps.findPendingInvitesByAccountId(accountId);

      expect(invites).toHaveLength(1);
      expect(invites[0]?.email).toBe("pending@example.com");
    });

    it("upsertPendingInvite refreshes an existing pending invite instead of duplicating it", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_upsert_invite");
      const expiresAt = new Date("2026-12-31T00:00:00.000Z");

      await deps.upsertPendingInvite(accountId, "refresh@example.com", {
        role: "ENGINEER",
        invitedBy: "dev_owner",
        inviteTokenHash: "hash_original",
        inviteTokenExpiresAt: expiresAt,
        inviteId: "inv_original"
      });
      const refreshed = await deps.upsertPendingInvite(accountId, "refresh@example.com", {
        role: "SENIOR_ENGINEER",
        invitedBy: "dev_owner",
        inviteTokenHash: "hash_refreshed",
        inviteTokenExpiresAt: expiresAt,
        inviteId: "inv_should_not_replace"
      });

      expect(refreshed.role).toBe("SENIOR_ENGINEER");
      expect(refreshed.inviteId).toBe("inv_original");
      expect(await deps.countInvitesByAccountId(accountId)).toBe(1);
      const stored = await deps.findInviteByEmail(accountId, "refresh@example.com");
      expect(stored?.role).toBe("SENIOR_ENGINEER");
    });

    it("upsertPendingInvite creates a pending invite when none exists", async () => {
      const deps = getDeps();
      const { accountId } = await deps.seedAccount("acct_new_invite");
      const expiresAt = new Date("2026-12-31T00:00:00.000Z");

      const invite = await deps.upsertPendingInvite(accountId, "new@example.com", {
        role: "ENGINEER",
        invitedBy: "dev_owner",
        inviteTokenHash: "hash_new",
        inviteTokenExpiresAt: expiresAt,
        inviteId: "inv_new"
      });

      expect(invite.inviteId).toBe("inv_new");
      expect(invite.email).toBe("new@example.com");
      expect(await deps.countInvitesByAccountId(accountId)).toBe(1);
    });
  });
}
