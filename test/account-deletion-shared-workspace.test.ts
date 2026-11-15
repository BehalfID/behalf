import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDeveloperUserForDeletion: vi.fn(),
  findMembershipsForDeletion: vi.fn(),
  countOtherMemberships: vi.fn(),
  deleteMembershipForDeletion: vi.fn(),
  deleteAccountCascade: vi.fn(),
  deleteDeveloperUserCredentials: vi.fn(),
  findMembershipsByAccountId: vi.fn(),
  deleteEndpoints: vi.fn()
}));

vi.mock("@/lib/repositories/accountDeletion", () => ({
  findDeveloperUserForDeletion: mocks.findDeveloperUserForDeletion,
  findMembershipsForDeletion: mocks.findMembershipsForDeletion,
  countOtherMemberships: mocks.countOtherMemberships,
  deleteMembershipForDeletion: mocks.deleteMembershipForDeletion,
  deleteAccountCascade: mocks.deleteAccountCascade,
  deleteDeveloperUserCredentials: mocks.deleteDeveloperUserCredentials
}));
vi.mock("@/lib/repositories/memberships", () => ({
  findMembershipsByAccountId: mocks.findMembershipsByAccountId
}));
vi.mock("@/lib/repositories/webhooks", () => ({
  deleteEndpoints: mocks.deleteEndpoints
}));

import { deleteDeveloperUser, SOLE_OWNER_DELETION_ERROR } from "@/lib/accountDeletion";

const members: Record<string, Array<{ userId: string; role: string }>> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(members)) delete members[key];
  mocks.findDeveloperUserForDeletion.mockResolvedValue({ userId: "usr_me" });
  mocks.findMembershipsByAccountId.mockImplementation(async (accountId: string) => members[accountId] ?? []);
  mocks.countOtherMemberships.mockImplementation(
    async (accountId: string, userId: string) =>
      (members[accountId] ?? []).filter((m) => m.userId !== userId).length
  );
});

describe("deleteDeveloperUser with shared workspaces", () => {
  it("refuses to delete the only OWNER of a workspace with other members and changes nothing", async () => {
    members.acct_personal = [{ userId: "usr_me", role: "OWNER" }];
    members.acct_team = [
      { userId: "usr_me", role: "OWNER" },
      { userId: "usr_eng", role: "ENGINEER" }
    ];
    mocks.findMembershipsForDeletion.mockResolvedValue([
      { membershipId: "mem_1", accountId: "acct_personal", role: "OWNER" },
      { membershipId: "mem_2", accountId: "acct_team", role: "OWNER" }
    ]);

    const result = await deleteDeveloperUser("usr_me");

    expect(result).toEqual({ ok: false, error: SOLE_OWNER_DELETION_ERROR, status: 409 });
    expect(mocks.deleteAccountCascade).not.toHaveBeenCalled();
    expect(mocks.deleteMembershipForDeletion).not.toHaveBeenCalled();
    expect(mocks.deleteDeveloperUserCredentials).not.toHaveBeenCalled();
  });

  it("leaves a shared workspace with another owner and removes the user's endpoints there", async () => {
    members.acct_personal = [{ userId: "usr_me", role: "OWNER" }];
    members.acct_team = [
      { userId: "usr_me", role: "OWNER" },
      { userId: "usr_other_owner", role: "OWNER" }
    ];
    mocks.findMembershipsForDeletion.mockResolvedValue([
      { membershipId: "mem_1", accountId: "acct_personal", role: "OWNER" },
      { membershipId: "mem_2", accountId: "acct_team", role: "OWNER" }
    ]);

    const result = await deleteDeveloperUser("usr_me");

    expect(result).toEqual({ ok: true, deletedUserId: "usr_me", deletedAccountIds: ["acct_personal"] });
    expect(mocks.deleteAccountCascade).toHaveBeenCalledWith("acct_personal", "usr_me");
    expect(mocks.deleteMembershipForDeletion).toHaveBeenCalledWith("mem_2");
    expect(mocks.deleteEndpoints).toHaveBeenCalledWith({ accountId: "acct_team", developerUserId: "usr_me" });
    expect(mocks.deleteDeveloperUserCredentials).toHaveBeenCalledWith("usr_me");
  });

  it("lets a non-owner member of a shared workspace delete their account", async () => {
    members.acct_team = [
      { userId: "usr_owner", role: "OWNER" },
      { userId: "usr_me", role: "ENGINEER" }
    ];
    mocks.findMembershipsForDeletion.mockResolvedValue([
      { membershipId: "mem_2", accountId: "acct_team", role: "ENGINEER" }
    ]);

    const result = await deleteDeveloperUser("usr_me");
    expect(result.ok).toBe(true);
    expect(mocks.deleteAccountCascade).not.toHaveBeenCalled();
  });
});
