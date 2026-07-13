import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAccountBySlugLean: vi.fn(),
  findAccountByIdLean: vi.fn(),
  accountCreate: vi.fn(),
  accountFindOne: vi.fn(),
  accountUpdateOne: vi.fn(),
  developerUserUpdateOne: vi.fn(),
  ensureAccountMembership: vi.fn(),
  getWorkspaceActor: vi.fn(),
  canManageMembers: vi.fn(),
  agentCountDocuments: vi.fn(),
  membershipFind: vi.fn(),
  developerUserFindOne: vi.fn()
}));

vi.mock("@/lib/repositories/accounts", () => ({
  findAccountBySlugLean: mocks.findAccountBySlugLean,
  findAccountByIdLean: mocks.findAccountByIdLean
}));

vi.mock("@/models/Account", () => ({
  default: {
    create: mocks.accountCreate,
    findOne: mocks.accountFindOne,
    updateOne: mocks.accountUpdateOne
  }
}));

vi.mock("@/models/DeveloperUser", () => ({
  default: {
    updateOne: mocks.developerUserUpdateOne,
    findOne: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        lean: mocks.developerUserFindOne
      })
    }))
  }
}));

vi.mock("@/models/Agent", () => ({
  default: { countDocuments: mocks.agentCountDocuments }
}));

vi.mock("@/models/AccountMembership", () => ({
  default: {
    find: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        lean: mocks.membershipFind
      })
    }))
  }
}));

vi.mock("@/lib/delegatedAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/delegatedAuth")>();
  return {
    ...actual,
    ensureAccountMembership: mocks.ensureAccountMembership,
    getWorkspaceActor: mocks.getWorkspaceActor,
    canManageMembers: mocks.canManageMembers
  };
});

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));

function accountFindOneLean(value: unknown) {
  mocks.accountFindOne.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(value)
    })
  });
}

describe("resolvePermanentWorkspaceSlugSeed", () => {
  it("uses companyName for business accounts", async () => {
    const { resolvePermanentWorkspaceSlugSeed } = await import("@/lib/workspaceSlugServer");
    expect(
      resolvePermanentWorkspaceSlugSeed({
        accountType: "business",
        companyName: "Trajectus",
        name: "leeza"
      })
    ).toBe("Trajectus");
  });

  it("does not use email local part as the business slug seed", async () => {
    const { resolvePermanentWorkspaceSlugSeed } = await import("@/lib/workspaceSlugServer");
    expect(
      resolvePermanentWorkspaceSlugSeed({
        accountType: "business",
        companyName: "Trajectus",
        name: "leeza"
      })
    ).not.toBe("leeza");
  });

  it("uses workspaceName for individual accounts", async () => {
    const { resolvePermanentWorkspaceSlugSeed } = await import("@/lib/workspaceSlugServer");
    expect(
      resolvePermanentWorkspaceSlugSeed({
        accountType: "individual",
        companyName: null,
        name: "Grace Hopper"
      })
    ).toBe("Grace Hopper");
  });

  it("falls back to workspace when names are empty", async () => {
    const { resolvePermanentWorkspaceSlugSeed } = await import("@/lib/workspaceSlugServer");
    expect(resolvePermanentWorkspaceSlugSeed({ accountType: "individual", name: "" })).toBe(
      "workspace"
    );
  });
});

describe("createDeveloperAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accountCreate.mockResolvedValue({ accountId: "acct_new" });
    accountFindOneLean({ accountId: "acct_new", name: "leeza", slug: null });
    mocks.developerUserUpdateOne.mockResolvedValue({});
    mocks.ensureAccountMembership.mockResolvedValue(undefined);
  });

  it("creates an account without assigning a slug", async () => {
    const { createDeveloperAccount } = await import("@/lib/account");
    const account = await createDeveloperAccount("dev_leeza", "leeza@trajectus.com");
    expect(mocks.accountCreate).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: expect.any(String), name: "leeza", slug: null })
    );
    expect(account.slug ?? null).toBeNull();
    expect(mocks.findAccountBySlugLean).not.toHaveBeenCalled();
  });
});

describe("completeAccountSetup slug lifecycle", () => {
  const completionBody = {
    firstName: "Leeza",
    lastName: "Admin",
    accountType: "business",
    companyName: "Trajectus",
    workspaceName: "Trajectus Ops",
    agentTools: ["cursor"],
    controlAreas: ["production_deploys"],
    primaryGoal: "approvals",
    firstSetupGoal: "create_agent"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceActor.mockResolvedValue({
      userId: "dev_leeza",
      accountId: "acct_trajectus",
      role: "OWNER",
      authorityLevel: 100
    });
    mocks.canManageMembers.mockReturnValue(true);
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    mocks.agentCountDocuments.mockResolvedValue(0);
    mocks.membershipFind.mockResolvedValue([]);
    mocks.developerUserFindOne.mockResolvedValue(null);
    mocks.developerUserUpdateOne.mockResolvedValue({ matchedCount: 1 });

    let storedSlug: string | null = null;
    accountFindOneLean({ accountId: "acct_trajectus", slug: storedSlug });
    mocks.accountFindOne.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(async () => ({
          accountId: "acct_trajectus",
          slug: storedSlug
        }))
      })
    }));
    mocks.accountUpdateOne.mockImplementation(async (_filter: unknown, update: { $set: { slug?: string } }) => {
      if (update.$set.slug) storedSlug = update.$set.slug;
      return { matchedCount: 1, modifiedCount: 1 };
    });
  });

  it("leeza@trajectus.com + companyName Trajectus => trajectus slug", async () => {
    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const result = await completeAccountSetup("dev_leeza", "acct_trajectus", completionBody);
    expect(result.error).toBeNull();
    expect(result.nextRoute).toBe("/trajectus/dashboard/agents/new");
    expect(mocks.accountUpdateOne).toHaveBeenCalledWith(
      { accountId: "acct_trajectus" },
      expect.objectContaining({
        $set: expect.objectContaining({ slug: "trajectus", companyName: "Trajectus" })
      })
    );
    expect(mocks.developerUserUpdateOne).toHaveBeenCalledWith(
      { userId: "dev_leeza" },
      expect.objectContaining({
        $set: expect.objectContaining({ onboardingCompletedAt: expect.any(Date) })
      })
    );
  });

  it("uses deterministic suffix when base slug collides", async () => {
    mocks.findAccountBySlugLean.mockImplementation(async (slug: string) =>
      slug === "trajectus" ? { accountId: "acct_other", slug } : null
    );
    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const { stableAccountIdSuffix } = await import("@/lib/workspaceSlugServer");
    const result = await completeAccountSetup("dev_leeza", "acct_trajectus", completionBody);
    expect(result.error).toBeNull();
    expect(result.nextRoute).toBe(
      `/trajectus-${stableAccountIdSuffix("acct_trajectus", 8)}/dashboard/agents/new`
    );
  });

  it("does not mark onboarding complete when slug allocation fails", async () => {
    mocks.findAccountBySlugLean.mockResolvedValue({ accountId: "acct_other", slug: "taken" });
    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const result = await completeAccountSetup("dev_leeza", "acct_trajectus", completionBody);
    expect(result.error).toMatch(
      /exhausting deterministic candidates|allocation failed|duplicate-key retries/i
    );
    expect(mocks.developerUserUpdateOne).not.toHaveBeenCalled();
  });

  it("does not mark onboarding complete when account update fails", async () => {
    mocks.accountUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const result = await completeAccountSetup("dev_leeza", "acct_trajectus", completionBody);
    expect(result.error).toMatch(/Account update failed|Slug persistence verification failed/i);
    expect(mocks.developerUserUpdateOne).not.toHaveBeenCalled();
  });

  it("preserves an existing valid legacy slug when company name changes", async () => {
    accountFindOneLean({ accountId: "acct_trajectus", slug: "trajectus" });
    mocks.accountFindOne.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ accountId: "acct_trajectus", slug: "trajectus" })
      })
    }));
    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const result = await completeAccountSetup("dev_leeza", "acct_trajectus", {
      ...completionBody,
      companyName: "Trajectus Renamed",
      workspaceName: "Trajectus Renamed"
    });
    expect(result.error).toBeNull();
    expect(result.nextRoute).toBe("/trajectus/dashboard/agents/new");
    expect(mocks.accountUpdateOne).toHaveBeenCalledWith(
      { accountId: "acct_trajectus" },
      expect.objectContaining({
        $set: expect.not.objectContaining({ slug: expect.any(String) })
      })
    );
  });

  it("retry after failure succeeds cleanly", async () => {
    let failOnce = true;
    mocks.accountUpdateOne.mockImplementation(async (_filter: unknown, update: { $set: { slug?: string } }) => {
      if (failOnce) {
        failOnce = false;
        return { matchedCount: 0, modifiedCount: 0 };
      }
      if (update.$set.slug) {
        accountFindOneLean({ accountId: "acct_trajectus", slug: update.$set.slug });
        mocks.accountFindOne.mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue({ accountId: "acct_trajectus", slug: update.$set.slug })
          })
        }));
      }
      return { matchedCount: 1, modifiedCount: 1 };
    });

    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const first = await completeAccountSetup("dev_leeza", "acct_trajectus", completionBody);
    expect(first.error).toMatch(/Account update failed|Slug persistence verification failed/i);
    expect(mocks.developerUserUpdateOne).not.toHaveBeenCalled();

    const second = await completeAccountSetup("dev_leeza", "acct_trajectus", completionBody);
    expect(second.error).toBeNull();
    expect(second.nextRoute).toBe("/trajectus/dashboard/agents/new");
    expect(mocks.developerUserUpdateOne).toHaveBeenCalledTimes(1);
  });
});

describe("ensureAccountHasSlug backfill eligibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.agentCountDocuments.mockResolvedValue(0);
    mocks.membershipFind.mockResolvedValue([]);
    mocks.developerUserFindOne.mockResolvedValue(null);
  });

  it("returns null for incomplete new accounts without assigning a slug", async () => {
    mocks.findAccountByIdLean.mockResolvedValue({
      accountId: "acct_new",
      name: "leeza",
      companyName: null,
      slug: null,
      accountType: null,
      createdAt: "2026-07-03T00:00:00.000Z",
      verificationCount: 0,
      onboarding: null
    });
    const { ensureAccountHasSlug } = await import("@/lib/workspaceSlugServer");
    await expect(ensureAccountHasSlug("acct_new")).resolves.toBeNull();
    expect(mocks.accountUpdateOne).not.toHaveBeenCalled();
  });

  it("backfills eligible legacy accounts from companyName not email local part", async () => {
    mocks.findAccountByIdLean
      .mockResolvedValueOnce({
        accountId: "acct_legacy",
        name: "leeza",
        companyName: "Acme",
        slug: null,
        accountType: "business",
        createdAt: "2026-07-03T00:00:00.000Z",
        verificationCount: 0,
        onboarding: { firstSetupGoal: "create_agent" }
      })
      .mockResolvedValueOnce({
        accountId: "acct_legacy",
        name: "leeza",
        companyName: "Acme",
        slug: null,
        accountType: "business",
        createdAt: "2026-07-03T00:00:00.000Z",
        verificationCount: 0,
        onboarding: { firstSetupGoal: "create_agent" }
      })
      .mockResolvedValue({ slug: "acme" });
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    mocks.accountUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const { ensureAccountHasSlug } = await import("@/lib/workspaceSlugServer");
    await expect(ensureAccountHasSlug("acct_legacy")).resolves.toBe("acme");
  });
});
