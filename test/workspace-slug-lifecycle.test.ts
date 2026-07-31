import { beforeEach, describe, expect, it, vi } from "vitest";
import { leanQuery } from "./helpers/mongoQueryMock";

const mocks = vi.hoisted(() => ({
  findAccountBySlugLean: vi.fn(),
  findAccountByIdLean: vi.fn(),
  findAccount: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  updateUser: vi.fn(),
  ensureAccountMembership: vi.fn(),
  getWorkspaceActor: vi.fn(),
  canManageMembers: vi.fn(),
  agentCountDocuments: vi.fn(),
  membershipFind: vi.fn(),
  developerUserFindOne: vi.fn(),
  accountUpdateOne: vi.fn()
}));

vi.mock("@/lib/repositories/accounts", () => ({
  findAccountBySlugLean: mocks.findAccountBySlugLean,
  findAccountByIdLean: mocks.findAccountByIdLean,
  findAccount: mocks.findAccount,
  createAccount: mocks.createAccount,
  updateAccount: mocks.updateAccount
}));

vi.mock("@/lib/repositories/users", () => ({
  updateUser: mocks.updateUser,
  findByUserId: vi.fn()
}));

vi.mock("@/models/Account", () => ({
  default: {
    updateOne: mocks.accountUpdateOne
  }
}));

vi.mock("@/models/DeveloperUser", () => ({
  default: {
    findOne: vi.fn(() => leanQuery(null))
  }
}));

vi.mock("@/models/Agent", () => ({
  default: { countDocuments: mocks.agentCountDocuments }
}));

vi.mock("@/models/AccountMembership", () => ({
  default: {
    find: vi.fn(() => leanQuery([]))
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
    mocks.updateUser.mockResolvedValue({ matchedCount: 1 });
    mocks.ensureAccountMembership.mockResolvedValue(undefined);
  });

  it("creates an account payload with no own slug property", async () => {
    mocks.createAccount.mockImplementation(async (doc: Record<string, unknown>) => doc);
    mocks.findAccount.mockResolvedValue({ accountId: "acct_a", name: "leeza" });

    const { createDeveloperAccount } = await import("@/lib/account");
    await createDeveloperAccount("dev_leeza", "leeza@trajectus.com");

    expect(mocks.createAccount).toHaveBeenCalledTimes(1);
    const payload = mocks.createAccount.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, "slug")).toBe(false);
    expect(payload).toEqual(
      expect.objectContaining({ accountId: expect.any(String), name: "leeza" })
    );
    expect(mocks.findAccountBySlugLean).not.toHaveBeenCalled();
  });

  it("creates two separate incomplete accounts without slug allocation", async () => {
    const created: Record<string, unknown>[] = [];
    mocks.createAccount.mockImplementation(async (doc: Record<string, unknown>) => {
      created.push({ ...doc });
      return doc;
    });
    mocks.findAccount.mockImplementation(async (query: { accountId: string }) => {
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
    mocks.updateUser.mockResolvedValue({ matchedCount: 1 });

    let storedSlug: string | null = null;
    mocks.findAccountByIdLean.mockImplementation(async () => ({
      accountId: "acct_trajectus",
      slug: storedSlug
    }));
    mocks.updateAccount.mockImplementation(async (_accountId: string, update: { slug?: string }) => {
      if (update.slug) storedSlug = update.slug;
      return { matchedCount: 1, modifiedCount: 1 };
    });
  });

  it("leeza@trajectus.com + companyName Trajectus => trajectus slug", async () => {
    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const result = await completeAccountSetup("dev_leeza", "acct_trajectus", completionBody);
    expect(result.error).toBeNull();
    expect(result.nextRoute).toBe("/trajectus/dashboard/agents/new");
    expect(mocks.updateAccount).toHaveBeenCalledWith(
      "acct_trajectus",
      expect.objectContaining({ slug: "trajectus", companyName: "Trajectus" })
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
    mocks.findAccountByIdLean.mockImplementation(async () => ({
      accountId: "acct_aaaa",
      slug: slugA
    }));
    mocks.updateAccount.mockImplementation(async (_id: string, update: { slug?: string }) => {
      if (update.slug) slugA = update.slug;
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
    mocks.findAccountByIdLean.mockImplementation(async () => ({
      accountId: "acct_bbbb",
      slug: slugB
    }));
    mocks.updateAccount.mockImplementation(async (_id: string, update: { slug?: string }) => {
      if (update.slug) slugB = update.slug;
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
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("does not mark onboarding complete when account update fails", async () => {
    mocks.updateAccount.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const result = await completeAccountSetup("dev_leeza", "acct_trajectus", completionBody);
    expect(result.error).toMatch(/Account update failed|Slug persistence verification failed/i);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("preserves an existing valid legacy slug when company name changes", async () => {
    mocks.findAccountByIdLean.mockResolvedValue({
      accountId: "acct_trajectus",
      slug: "trajectus"
    });
    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const result = await completeAccountSetup("dev_leeza", "acct_trajectus", {
      ...completionBody,
      companyName: "Trajectus Renamed",
      workspaceName: "Trajectus Renamed"
    });
    expect(result.error).toBeNull();
    expect(result.nextRoute).toBe("/trajectus/dashboard/agents/new");
    expect(mocks.updateAccount).toHaveBeenCalledWith(
      "acct_trajectus",
      expect.not.objectContaining({ slug: expect.any(String) })
    );
  });

  it("retry after failure succeeds cleanly", async () => {
    let failOnce = true;
    let storedSlug: string | null = null;
    mocks.findAccountByIdLean.mockImplementation(async () => ({
      accountId: "acct_trajectus",
      slug: storedSlug
    }));
    mocks.updateAccount.mockImplementation(async (_id: string, update: { slug?: string }) => {
      if (failOnce) {
        failOnce = false;
        return { matchedCount: 0, modifiedCount: 0 };
      }
      if (update.slug) storedSlug = update.slug;
      return { matchedCount: 1, modifiedCount: 1 };
    });

    const { completeAccountSetup } = await import("@/lib/accountSetup");
    const first = await completeAccountSetup("dev_leeza", "acct_trajectus", completionBody);
    expect(first.error).toMatch(/Account update failed|Slug persistence verification failed/i);
    expect(mocks.updateUser).not.toHaveBeenCalled();

    const second = await completeAccountSetup("dev_leeza", "acct_trajectus", completionBody);
    expect(second.error).toBeNull();
    expect(second.nextRoute).toBe("/trajectus/dashboard/agents/new");
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
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

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.agentCountDocuments.mockResolvedValue(0);
    mocks.accountUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const AccountMembership = (await import("@/models/AccountMembership")).default as {
      find: ReturnType<typeof vi.fn>;
    };
    const DeveloperUser = (await import("@/models/DeveloperUser")).default as {
      findOne: ReturnType<typeof vi.fn>;
    };
    AccountMembership.find = vi.fn(() => leanQuery([{ userId: "dev_owner" }]));
    DeveloperUser.findOne = vi.fn(() => leanQuery({ onboardingCompletedAt: null }));
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
    const DeveloperUser = (await import("@/models/DeveloperUser")).default as {
      findOne: ReturnType<typeof vi.fn>;
    };
    DeveloperUser.findOne = vi.fn(() =>
      leanQuery({ onboardingCompletedAt: "2026-07-12T00:00:00.000Z" })
    );
    mocks.findAccountBySlugLean.mockResolvedValue(null);

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
    const AccountMembership = (await import("@/models/AccountMembership")).default as {
      find: ReturnType<typeof vi.fn>;
    };
    AccountMembership.find = vi.fn(() => leanQuery([]));
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
    const AccountMembership = (await import("@/models/AccountMembership")).default as {
      find: ReturnType<typeof vi.fn>;
    };
    AccountMembership.find = vi.fn(() => leanQuery([]));
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
    const AccountMembership = (await import("@/models/AccountMembership")).default as {
      find: ReturnType<typeof vi.fn>;
    };
    AccountMembership.find = vi.fn(() => leanQuery([]));
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
