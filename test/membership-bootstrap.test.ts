import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountFindOne: vi.fn(),
  userFindOne: vi.fn(),
  membershipFindOne: vi.fn(),
  membershipFindOneAndUpdate: vi.fn()
}));

vi.mock("@/models/Account", () => ({
  default: { findOne: mocks.accountFindOne }
}));

vi.mock("@/models/DeveloperUser", () => ({
  default: { findOne: mocks.userFindOne }
}));

vi.mock("@/models/AccountMembership", () => ({
  default: {
    findOne: mocks.membershipFindOne,
    findOneAndUpdate: mocks.membershipFindOneAndUpdate
  }
}));

describe("ensureAccountMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accountFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ accountId: "acct_test" }) });
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ primaryAccountId: "acct_test" })
      })
    });
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });
    mocks.membershipFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        membershipId: "mbr_test",
        userId: "user_test",
        accountId: "acct_test",
        role: "OWNER"
      })
    });
  });

  it("creates OWNER membership for the user's primary account", async () => {
    const { ensureAccountMembership } = await import("@/lib/delegatedAuth");
    const membership = await ensureAccountMembership("user_test", "acct_test");
    expect(membership?.role).toBe("OWNER");
    expect(mocks.membershipFindOneAndUpdate).toHaveBeenCalledOnce();
  });

  it("fails safely when account is missing", async () => {
    mocks.accountFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const { ensureAccountMembership, MembershipBootstrapError } = await import("@/lib/delegatedAuth");
    await expect(ensureAccountMembership("user_test", "acct_missing")).rejects.toBeInstanceOf(
      MembershipBootstrapError
    );
  });

  it("fails safely when bootstrapping a different account", async () => {
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ primaryAccountId: "acct_other" })
      })
    });
    const { ensureAccountMembership, MembershipBootstrapError } = await import("@/lib/delegatedAuth");
    await expect(ensureAccountMembership("user_test", "acct_test")).rejects.toBeInstanceOf(
      MembershipBootstrapError
    );
  });
});

describe("getWorkspaceActor", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.accountFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ accountId: "acct_test" }) });
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ primaryAccountId: "acct_test" })
      })
    });
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        membershipId: "mbr_existing",
        userId: "user_test",
        accountId: "acct_test",
        role: "ENGINEER"
      })
    });
  });

  it("returns null without accountId", async () => {
    const { getWorkspaceActor } = await import("@/lib/delegatedAuth");
    await expect(getWorkspaceActor("user_test", null)).resolves.toBeNull();
  });

  it("preserves existing membership role for invited users", async () => {
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ primaryAccountId: "acct_owner" })
      })
    });
    const { getWorkspaceActor } = await import("@/lib/delegatedAuth");
    const actor = await getWorkspaceActor("user_test", "acct_test");
    expect(actor?.role).toBe("ENGINEER");
  });
});
