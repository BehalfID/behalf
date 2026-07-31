import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMembershipsByUserId: vi.fn(),
  findMembershipByUserAndAccount: vi.fn(),
  findAccountByIdLean: vi.fn(),
  findAccountBySlugLean: vi.fn(),
  listAccounts: vi.fn(),
  updateActiveAccountId: vi.fn()
}));

vi.mock("@/lib/repositories/memberships", () => ({
  findMembershipsByUserId: mocks.findMembershipsByUserId,
  findMembershipByUserAndAccount: mocks.findMembershipByUserAndAccount
}));

vi.mock("@/lib/repositories/accounts", () => ({
  findAccountByIdLean: mocks.findAccountByIdLean,
  findAccountBySlugLean: mocks.findAccountBySlugLean,
  listAccounts: mocks.listAccounts
}));

vi.mock("@/lib/repositories/sessions", () => ({
  updateActiveAccountId: mocks.updateActiveAccountId
}));

describe("account context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses session active account when user is a member", async () => {
    mocks.findMembershipsByUserId.mockResolvedValue([
      { accountId: "acct_primary" },
      { accountId: "acct_team" }
    ]);
    const { resolveActiveAccountId } = await import("@/lib/accountContext");
    await expect(
      resolveActiveAccountId("user_a", {
        sessionActiveAccountId: "acct_team",
        primaryAccountId: "acct_primary"
      })
    ).resolves.toBe("acct_team");
  });

  it("falls back to primary account for single-account users", async () => {
    mocks.findMembershipsByUserId.mockResolvedValue([{ accountId: "acct_primary" }]);
    const { resolveActiveAccountId } = await import("@/lib/accountContext");
    await expect(
      resolveActiveAccountId("user_a", {
        sessionActiveAccountId: null,
        primaryAccountId: "acct_primary"
      })
    ).resolves.toBe("acct_primary");
  });

  it("rejects switching to accounts without membership", async () => {
    mocks.findMembershipByUserAndAccount.mockResolvedValue(null);
    const { switchActiveAccount } = await import("@/lib/accountContext");
    await expect(switchActiveAccount("user_a", "sess_a", "acct_other")).resolves.toEqual({
      error: "You do not have access to that workspace."
    });
  });

  it("allows switching only to member accounts", async () => {
    mocks.findMembershipByUserAndAccount.mockResolvedValue({
      membershipId: "mbr_team",
      accountId: "acct_team",
      userId: "user_a"
    });
    mocks.findAccountByIdLean.mockResolvedValue({
      accountId: "acct_team",
      name: "Team",
      slug: "team"
    });
    const { switchActiveAccount } = await import("@/lib/accountContext");
    await expect(switchActiveAccount("user_a", "sess_a", "acct_team")).resolves.toEqual({
      ok: true,
      accountId: "acct_team",
      slug: "team",
      name: "Team"
    });
    expect(mocks.updateActiveAccountId).toHaveBeenCalledWith("user_a", "sess_a", "acct_team");
  });

  it("includes slug on UserAccountSummary rows", async () => {
    mocks.findMembershipsByUserId.mockResolvedValue([
      { accountId: "acct_primary", role: "OWNER", userId: "user_a" },
      { accountId: "acct_team", role: "ENGINEER", userId: "user_a" }
    ]);
    mocks.listAccounts.mockResolvedValue([
      { accountId: "acct_primary", name: "Primary", slug: "primary" },
      { accountId: "acct_team", name: "Team", slug: "team" }
    ]);
    const { listUserAccounts } = await import("@/lib/accountContext");
    await expect(listUserAccounts("user_a", "acct_primary")).resolves.toEqual([
      {
        accountId: "acct_primary",
        slug: "primary",
        name: "Primary",
        role: "OWNER",
        isPrimary: true
      },
      {
        accountId: "acct_team",
        slug: "team",
        name: "Team",
        role: "ENGINEER",
        isPrimary: false
      }
    ]);
  });

  it("clears stale session activeAccountId when membership was removed", async () => {
    mocks.findMembershipsByUserId.mockResolvedValue([{ accountId: "acct_primary" }]);
    const { resolveActiveAccountId } = await import("@/lib/accountContext");
    await expect(
      resolveActiveAccountId("user_a", {
        sessionActiveAccountId: "acct_removed",
        sessionId: "sess_a",
        primaryAccountId: "acct_primary"
      })
    ).resolves.toBe("acct_primary");
    expect(mocks.updateActiveAccountId).toHaveBeenCalledWith("user_a", "sess_a", null);
  });
});
