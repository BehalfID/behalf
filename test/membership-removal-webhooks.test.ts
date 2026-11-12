import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteMembership = vi.fn();
const clearActiveAccountIdForUserAccount = vi.fn();
const deleteEndpoints = vi.fn();
const findMembershipsByAccountId = vi.fn();

vi.mock("@/lib/repositories/memberships", () => ({
  createMembership: vi.fn(),
  deleteMembership: (...args: unknown[]) => deleteMembership(...args),
  findMembershipByAccountAndUser: vi.fn(),
  findMembershipsByAccountId: (...args: unknown[]) => findMembershipsByAccountId(...args),
  findPendingInvitesByAccountId: vi.fn(),
  updateMembershipRole: vi.fn(),
  upsertPendingInvite: vi.fn()
}));
vi.mock("@/lib/repositories/sessions", () => ({
  clearActiveAccountIdForUserAccount: (...args: unknown[]) =>
    clearActiveAccountIdForUserAccount(...args)
}));
vi.mock("@/lib/repositories/webhooks", () => ({
  deleteEndpoints: (...args: unknown[]) => deleteEndpoints(...args)
}));

import { removeMember } from "@/lib/membershipManagement";

describe("removeMember webhook cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMembershipsByAccountId.mockResolvedValue([
      { membershipId: "mem_owner", userId: "usr_owner", role: "OWNER" },
      { membershipId: "mem_eng", userId: "usr_eng", role: "ENGINEER" }
    ]);
  });

  it("deletes the removed member's webhook endpoints in that workspace only", async () => {
    const result = await removeMember(
      { accountId: "acct_a", userId: "usr_owner", role: "OWNER" } as never,
      "mem_eng"
    );
    expect(result).toEqual({ ok: true });
    expect(deleteMembership).toHaveBeenCalledWith("mem_eng", "acct_a");
    expect(deleteEndpoints).toHaveBeenCalledWith({
      accountId: "acct_a",
      developerUserId: "usr_eng"
    });
  });

  it("does not touch endpoints when removal is forbidden", async () => {
    const result = await removeMember(
      { accountId: "acct_a", userId: "usr_eng", role: "ENGINEER" } as never,
      "mem_owner"
    );
    expect(result).toHaveProperty("error");
    expect(deleteEndpoints).not.toHaveBeenCalled();
  });
});
