import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountFindOne: vi.fn(),
  userFindOne: vi.fn(),
  membershipFindOne: vi.fn(),
  membershipFindOneAndUpdate: vi.fn(),
  membershipCountDocuments: vi.fn()
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
    findOneAndUpdate: mocks.membershipFindOneAndUpdate,
    countDocuments: mocks.membershipCountDocuments
  }
}));

describe("ensureAccountMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.membershipCountDocuments.mockResolvedValue(0);
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

  it("returns the existing membership without upserting", async () => {
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        membershipId: "mbr_existing",
        userId: "user_test",
        accountId: "acct_test",
        role: "VIEWER"
      })
    });
    const { ensureAccountMembership } = await import("@/lib/delegatedAuth");
    const membership = await ensureAccountMembership("user_test", "acct_test");
    expect(membership?.role).toBe("VIEWER");
    expect(mocks.membershipFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses to re-create OWNER for a creator removed from a workspace with other members", async () => {
    mocks.membershipCountDocuments.mockResolvedValue(1);
    const { ensureAccountMembership, MembershipBootstrapError } = await import("@/lib/delegatedAuth");
    await expect(ensureAccountMembership("user_test", "acct_test")).rejects.toBeInstanceOf(
      MembershipBootstrapError
    );
    expect(mocks.membershipFindOneAndUpdate).not.toHaveBeenCalled();
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

  it("returns null for a removed creator instead of restoring OWNER", async () => {
    mocks.membershipFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mocks.membershipCountDocuments.mockResolvedValue(2);
    const { getWorkspaceActor } = await import("@/lib/delegatedAuth");
    await expect(getWorkspaceActor("user_test", "acct_test")).resolves.toBeNull();
    expect(mocks.membershipFindOneAndUpdate).not.toHaveBeenCalled();
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

  it("defaults invalid membership role to VIEWER without OWNER authority", async () => {
    mocks.membershipFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        membershipId: "mbr_bad",
        userId: "user_test",
        accountId: "acct_test",
        role: "SUPERADMIN_INVALID"
      })
    });
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ primaryAccountId: "acct_owner" })
      })
    });
    const { AUTHORITY_LEVELS } = await import("@/lib/authority");
    const { getWorkspaceActor, canApproveRequest, canCreatePermission } = await import("@/lib/delegatedAuth");
    const actor = await getWorkspaceActor("user_test", "acct_test");
    expect(actor?.role).toBe("VIEWER");
    expect(actor?.authorityLevel).toBe(AUTHORITY_LEVELS.VIEWER);
    expect(actor?.authorityLevel).not.toBe(AUTHORITY_LEVELS.OWNER);
    expect(
      canCreatePermission(actor!, { action: "deploy_production", resource: "production" })
    ).toBe(false);
    expect(
      canApproveRequest(actor!, {
        requiredAuthorityLevel: AUTHORITY_LEVELS.ENGINEERING_LEAD,
        action: "deploy_production",
        vendor: "vercel.com"
      })
    ).toBe(false);
  });
});
