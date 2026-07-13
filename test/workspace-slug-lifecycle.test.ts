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
    mocks.developerUserUpdateOne.mockResolvedValue({});
    mocks.ensureAccountMembership.mockResolvedValue(undefined);
  });

  it("creates an account payload with no own slug property", async () => {
    mocks.accountCreate.mockImplementation(async (doc: Record<string, unknown>) => doc);
    mocks.accountFindOne.mockImplementation((query: { accountId: string }) => ({
      // Mimic a Mongo document that never received a slug key.
      then: undefined,
      ...query,
      name: "leeza"
    }));
    // Account.findOne returns a thenable-like in production; provide a resolved doc.
    mocks.accountFindOne.mockResolvedValue({ accountId: "acct_a", name: "leeza" });

    const { createDeveloperAccount } = await import("@/lib/account");
    await createDeveloperAccount("dev_leeza", "leeza@trajectus.com");

    expect(mocks.accountCreate).toHaveBeenCalledTimes(1);
    const payload = mocks.accountCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, "slug")).toBe(false);
    expect(payload).toEqual(
      expect.objectContaining({ accountId: expect.any(String), name: "leeza" })
    );
    expect(mocks.findAccountBySlugLean).not.toHaveBeenCalled();
  });

  it("creates two separate incomplete accounts without slug allocation", async () => {
    const created: Record<string, unknown>[] = [];
    mocks.accountCreate.mockImplementation(async (doc: Record<string, unknown>) => {
      created.push({ ...doc });
      return doc;
    });
    mocks.accountFindOne.mockImplementation(async (query: { accountId: string }) => {
      const match = created.find((row) => row.accountId === query.accountId);
      return match ? { ...match } : null;
    });

    const { createDeveloperAccount } = await import("@/lib/account");
    const a = await createDeveloperAccount("dev_a", "alice@example.com");
    const b = await createDeveloperAccount("dev_b", "bob@example.com");

    expect(created).toHaveLength(2);
    for (const row of created) {
      expect(Object.prototype.hasOwnProperty.call(row, "slug")).toBe(false);
    }
    expect(a.accountId).not.toBe(b.accountId);
    expect(Object.prototype.hasOwnProperty.call(a, "slug")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(b, "slug")).toBe(false);
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
  });

  it("assigns permanent slugs for two previously incomplete accounts", async () => {
    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const { stableAccountIdSuffix } = await import("@/lib/workspaceSlugServer");

    mocks.getWorkspaceActor.mockResolvedValue({
      userId: "dev_a",
      accountId: "acct_aaaa",
      role: "OWNER",
      authorityLevel: 100
    });
    let slugA: string | undefined;
    mocks.accountFindOne.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(async () => ({ accountId: "acct_aaaa", slug: slugA }))
      })
    }));
    mocks.accountUpdateOne.mockImplementation(async (_f: unknown, update: { $set: { slug?: string } }) => {
      if (update.$set.slug) slugA = update.$set.slug;
      return { matchedCount: 1, modifiedCount: 1 };
    });
    const first = await completeAccountSetup("dev_a", "acct_aaaa", {
      ...completionBody,
      companyName: "Acme"
    });
    expect(first.error).toBeNull();
    expect(first.nextRoute).toBe("/acme/dashboard/agents/new");

    mocks.getWorkspaceActor.mockResolvedValue({
      userId: "dev_b",
      accountId: "acct_bbbb",
      role: "OWNER",
      authorityLevel: 100
    });
    mocks.findAccountBySlugLean.mockImplementation(async (slug: string) =>
      slug === "acme" ? { accountId: "acct_aaaa", slug } : null
    );
    let slugB: string | undefined;
    mocks.accountFindOne.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(async () => ({ accountId: "acct_bbbb", slug: slugB }))
      })
    }));
    mocks.accountUpdateOne.mockImplementation(async (_f: unknown, update: { $set: { slug?: string } }) => {
      if (update.$set.slug) slugB = update.$set.slug;
      return { matchedCount: 1, modifiedCount: 1 };
    });
    const second = await completeAccountSetup("dev_b", "acct_bbbb", {
      ...completionBody,
      companyName: "Acme"
    });
    expect(second.error).toBeNull();
    expect(second.nextRoute).toBe(
      `/acme-${stableAccountIdSuffix("acct_bbbb", 8)}/dashboard/agents/new`
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
  const partialOnboardingAccount = {
    accountId: "acct_partial",
    name: "leeza",
    companyName: "Trajectus",
    slug: undefined,
    accountType: "business",
    createdAt: "2026-07-03T00:00:00.000Z",
    verificationCount: 0,
    onboarding: { firstSetupGoal: "create_agent" }
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.agentCountDocuments.mockResolvedValue(0);
    mocks.membershipFind.mockResolvedValue([{ userId: "dev_owner" }]);
    mocks.developerUserFindOne.mockResolvedValue({ onboardingCompletedAt: null });
  });

  it("denies backfill for partial onboarding without owner completion", async () => {
    mocks.findAccountByIdLean.mockResolvedValue(partialOnboardingAccount);
    const { isAccountEligibleForSlugBackfill, ensureAccountHasSlug } = await import(
      "@/lib/workspaceSlugServer"
    );
    await expect(isAccountEligibleForSlugBackfill("acct_partial")).resolves.toBe(false);
    await expect(ensureAccountHasSlug("acct_partial")).resolves.toBeNull();
    expect(mocks.accountUpdateOne).not.toHaveBeenCalled();
  });

  it("allows backfill once owner onboardingCompletedAt is populated", async () => {
    mocks.findAccountByIdLean.mockImplementation(async (_id: string, fields?: string) => {
      if (typeof fields === "string" && fields === "slug") {
        return { slug: "trajectus" };
      }
      return { ...partialOnboardingAccount };
    });
    mocks.developerUserFindOne.mockResolvedValue({
      onboardingCompletedAt: "2026-07-12T00:00:00.000Z"
    });
    mocks.findAccountBySlugLean.mockResolvedValue(null);
    mocks.accountUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const { isAccountEligibleForSlugBackfill, ensureAccountHasSlug } = await import(
      "@/lib/workspaceSlugServer"
    );
    await expect(isAccountEligibleForSlugBackfill("acct_partial")).resolves.toBe(true);
    await expect(ensureAccountHasSlug("acct_partial")).resolves.toBe("trajectus");
  });

  it("allows pre-launch legacy accounts without onboardingCompletedAt", async () => {
    mocks.findAccountByIdLean.mockResolvedValue({
      accountId: "acct_legacy",
      name: "Legacy Co",
      companyName: "Legacy Co",
      createdAt: "2026-01-01T00:00:00.000Z",
      verificationCount: 0
    });
    mocks.membershipFind.mockResolvedValue([]);
    mocks.agentCountDocuments.mockResolvedValue(0);
    const { isAccountEligibleForSlugBackfill } = await import("@/lib/workspaceSlugServer");
    await expect(isAccountEligibleForSlugBackfill("acct_legacy")).resolves.toBe(true);
  });

  it("allows accounts with existing agent activity", async () => {
    mocks.findAccountByIdLean.mockResolvedValue({
      accountId: "acct_agents",
      name: "leeza",
      companyName: "Trajectus",
      accountType: "business",
      createdAt: "2026-07-03T00:00:00.000Z",
      verificationCount: 0
    });
    mocks.agentCountDocuments.mockResolvedValue(2);
    mocks.membershipFind.mockResolvedValue([]);
    const { isAccountEligibleForSlugBackfill } = await import("@/lib/workspaceSlugServer");
    await expect(isAccountEligibleForSlugBackfill("acct_agents")).resolves.toBe(true);
  });

  it("allows accounts with verification activity", async () => {
    mocks.findAccountByIdLean.mockResolvedValue({
      accountId: "acct_verify",
      name: "leeza",
      companyName: "Trajectus",
      accountType: "business",
      createdAt: "2026-07-03T00:00:00.000Z",
      verificationCount: 3
    });
    mocks.agentCountDocuments.mockResolvedValue(0);
    mocks.membershipFind.mockResolvedValue([]);
    const { isAccountEligibleForSlugBackfill } = await import("@/lib/workspaceSlugServer");
    await expect(isAccountEligibleForSlugBackfill("acct_verify")).resolves.toBe(true);
  });

  it("returns an existing valid slug without rewriting it", async () => {
    mocks.findAccountByIdLean.mockResolvedValue({
      accountId: "acct_locked",
      name: "Renamed",
      companyName: "Renamed LLC",
      slug: "trajectus",
      accountType: "business",
      createdAt: "2026-07-03T00:00:00.000Z",
      verificationCount: 0
    });
    const { ensureAccountHasSlug } = await import("@/lib/workspaceSlugServer");
    await expect(ensureAccountHasSlug("acct_locked")).resolves.toBe("trajectus");
    expect(mocks.accountUpdateOne).not.toHaveBeenCalled();
  });
});
