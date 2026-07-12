import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getNextRouteForFirstSetupGoal,
  legacyUseCaseToAccountType,
  shouldRedirectToAccountSetup,
  validateAccountSetupCompletion,
  validatePhone
} from "@/lib/onboarding";

describe("onboarding helpers", () => {
  it("maps firstSetupGoal to next routes", () => {
    expect(getNextRouteForFirstSetupGoal("create_agent")).toBe("/dashboard/agents/new");
    expect(getNextRouteForFirstSetupGoal("setup_deploy_approvals")).toBe(
      "/dashboard/agents/new?focus=production_deploys"
    );
    expect(getNextRouteForFirstSetupGoal("invite_team")).toBe("/dashboard/settings?panel=members");
    expect(getNextRouteForFirstSetupGoal("explore_sandbox")).toBe("/sandbox");
  });

  it("maps legacy onboardingUseCase for compatibility", () => {
    expect(legacyUseCaseToAccountType("personal")).toBe("individual");
    expect(legacyUseCaseToAccountType("website")).toBe("business");
    expect(legacyUseCaseToAccountType("sdk")).toBe("business");
  });

  it("redirects only new post-launch users without activity", () => {
    expect(
      shouldRedirectToAccountSetup({
        onboardingCompletedAt: null,
        createdAt: "2026-07-03T00:00:00.000Z",
        agentCount: 0,
        verificationCount: 0
      })
    ).toBe(true);

    expect(
      shouldRedirectToAccountSetup({
        onboardingCompletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        agentCount: 0,
        verificationCount: 0
      })
    ).toBe(false);

    expect(
      shouldRedirectToAccountSetup({
        onboardingCompletedAt: null,
        createdAt: "2026-07-03T00:00:00.000Z",
        agentCount: 2,
        verificationCount: 0
      })
    ).toBe(false);
  });
});

describe("account setup validation", () => {
  const validBusiness = {
    firstName: "Ada",
    lastName: "Lovelace",
    accountType: "business" as const,
    companyName: "Analytical Engines",
    workspaceName: "Analytical Engines",
    onboarding: {
      agentTools: ["cursor" as const],
      controlAreas: ["production_deploys" as const],
      primaryGoal: "approvals" as const,
      firstSetupGoal: "create_agent" as const
    }
  };

  const validIndividual = {
    firstName: "Grace",
    lastName: "Hopper",
    accountType: "individual" as const,
    workspaceName: "Grace Hopper",
    onboarding: {
      agentTools: ["codex" as const],
      controlAreas: ["github_writes" as const],
      primaryGoal: "audit" as const,
      firstSetupGoal: "explore_sandbox" as const
    }
  };

  it("requires firstName and lastName on completion", () => {
    expect(validateAccountSetupCompletion({ ...validBusiness, firstName: "" }).error).toMatch(
      /firstName/
    );
    expect(validateAccountSetupCompletion({ ...validBusiness, lastName: "" }).error).toMatch(
      /lastName/
    );
  });

  it("requires companyName for business but not individual", () => {
    expect(
      validateAccountSetupCompletion({ ...validBusiness, companyName: "" }).error
    ).toMatch(/companyName/);
    expect(validateAccountSetupCompletion(validIndividual).error).toBeNull();
  });

  it("defaults primaryGoal to approvals when omitted", () => {
    const { primaryGoal: _removed, ...onboardingWithoutGoal } = validIndividual.onboarding;
    const result = validateAccountSetupCompletion({
      ...validIndividual,
      onboarding: onboardingWithoutGoal
    });
    expect(result.error).toBeNull();
    expect(result.account.onboarding.primaryGoal).toBe("approvals");
  });

  it("rejects invalid accountType and enum values", () => {
    expect(
      validateAccountSetupCompletion({ ...validBusiness, accountType: "enterprise" as never }).error
    ).toMatch(/accountType/);
    expect(
      validateAccountSetupCompletion({
        ...validBusiness,
        onboarding: { ...validBusiness.onboarding, primaryGoal: "sell" as never }
      }).error
    ).toMatch(/primaryGoal/);
  });

  it("allows optional phone and rejects invalid phone", () => {
    expect(validatePhone("")).toEqual({ value: undefined, error: null });
    expect(validatePhone("abc")).toMatchObject({ error: expect.stringMatching(/phone/) });
    expect(validateAccountSetupCompletion({ ...validBusiness, phone: "123" }).error).toMatch(/phone/);
    expect(validateAccountSetupCompletion({ ...validBusiness, phone: "+1 415 555 0100" }).error).toBeNull();
  });

  it("rejects invalid website and requires other text when selected", () => {
    expect(
      validateAccountSetupCompletion({ ...validBusiness, website: "not a url::::" }).error
    ).toMatch(/website/);
    expect(
      validateAccountSetupCompletion({
        ...validBusiness,
        onboarding: {
          ...validBusiness.onboarding,
          agentTools: ["other"],
          controlAreas: ["other"],
          agentToolsOther: "",
          controlAreasOther: ""
        }
      }).error
    ).toMatch(/agentToolsOther|controlAreasOther/);
  });
});

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  canManageMembers: vi.fn(),
  DeveloperUser: {
    findOne: vi.fn(),
    updateOne: vi.fn()
  },
  Account: {
    findOne: vi.fn(),
    updateOne: vi.fn()
  },
  AccountMembership: {
    findOne: vi.fn()
  }
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: mocks.requireDeveloperApi,
  requireDashboardMutationOrigin: vi.fn(() => null)
}));

vi.mock("@/lib/delegatedAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/delegatedAuth")>();
  return {
    ...actual,
    getWorkspaceActor: mocks.getWorkspaceActor,
    canManageMembers: mocks.canManageMembers
  };
});

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));

vi.mock("@/models/DeveloperUser", () => ({ default: mocks.DeveloperUser }));
vi.mock("@/models/Account", () => ({ default: mocks.Account }));
vi.mock("@/models/AccountMembership", () => ({ default: mocks.AccountMembership }));

function jsonRequest(url: string, init?: RequestInit) {
  return new Request(url, {
    ...init,
    headers: {
      Origin: "http://example.test",
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

describe("account setup API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireDeveloperApi.mockResolvedValue({
      user: {
        userId: "dev_test",
        email: "dev@example.com",
        primaryAccountId: "acct_other",
        emailVerified: true
      },
      account: { accountId: "acct_other", name: "Other" },
      error: null
    });
    mocks.getWorkspaceActor.mockResolvedValue({
      userId: "dev_test",
      accountId: "acct_test",
      role: "OWNER",
      authorityLevel: 100
    });
    mocks.canManageMembers.mockReturnValue(true);
    mocks.DeveloperUser.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          userId: "dev_test",
          email: "dev@example.com",
          emailVerified: true,
          firstName: null,
          lastName: null,
          jobTitle: null,
          phone: null,
          onboardingCompletedAt: null,
          onboardingUseCase: "sdk",
          primaryAccountId: "acct_test"
        })
      })
    });
    mocks.Account.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ accountType: "business" })
      }),
      lean: vi.fn().mockResolvedValue({
        accountId: "acct_test",
        name: "Workspace",
        accountType: null,
        companyName: null,
        website: null,
        teamSize: null,
        onboarding: null
      })
    });
    mocks.DeveloperUser.updateOne.mockResolvedValue({});
    mocks.Account.updateOne.mockResolvedValue({});
  });

  it("rejects completion without required names", async () => {
    const { POST } = await import("@/app/api/onboarding/account-setup/complete/route");
    const response = await POST(
      jsonRequest("http://example.test/api/onboarding/account-setup/complete", {
        method: "POST",
        body: JSON.stringify({ accountType: "individual" })
      }) as never
    );
    expect(response.status).toBe(400);
  });

  it("sets onboardingCompletedAt on completion", async () => {
    const { POST } = await import("@/app/api/onboarding/account-setup/complete/route");
    mocks.requireDeveloperApi.mockResolvedValue({
      user: {
        userId: "dev_test",
        email: "dev@example.com",
        primaryAccountId: "acct_test",
        emailVerified: true
      },
      account: { accountId: "acct_test", name: "Workspace" },
      error: null
    });

    const response = await POST(
      jsonRequest("http://example.test/api/onboarding/account-setup/complete", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Ada",
          lastName: "Lovelace",
          accountType: "business",
          companyName: "Engines Inc",
          workspaceName: "Engines Inc",
          agentTools: ["cursor"],
          controlAreas: ["production_deploys"],
          primaryGoal: "approvals",
          firstSetupGoal: "create_agent"
        })
      }) as never
    );
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.nextRoute).toMatch(/^\/[^/]+\/dashboard\/agents\/new$/);
    expect(mocks.DeveloperUser.updateOne).toHaveBeenCalledWith(
      { userId: "dev_test" },
      expect.objectContaining({
        $set: expect.objectContaining({
          firstName: "Ada",
          lastName: "Lovelace",
          onboardingCompletedAt: expect.any(Date)
        })
      })
    );
  });

  it("blocks VIEWER from account-level PATCH", async () => {
    mocks.requireDeveloperApi.mockResolvedValue({
      user: {
        userId: "dev_viewer",
        email: "viewer@example.com",
        primaryAccountId: "acct_test",
        emailVerified: true
      },
      account: { accountId: "acct_test", name: "Workspace" },
      error: null
    });
    mocks.getWorkspaceActor.mockResolvedValue({
      userId: "dev_viewer",
      accountId: "acct_test",
      role: "VIEWER",
      authorityLevel: 10
    });
    mocks.canManageMembers.mockReturnValue(false);

    const { PATCH } = await import("@/app/api/onboarding/account-setup/route");
    const response = await PATCH(
      jsonRequest("http://example.test/api/onboarding/account-setup", {
        method: "PATCH",
        body: JSON.stringify({ workspaceName: "Hacked" })
      }) as never
    );
    expect(response.status).toBe(403);
  });

  it("allows profile PATCH without manage-members permission", async () => {
    mocks.requireDeveloperApi.mockResolvedValue({
      user: {
        userId: "dev_viewer",
        email: "viewer@example.com",
        primaryAccountId: "acct_test",
        emailVerified: true
      },
      account: { accountId: "acct_test", name: "Workspace" },
      error: null
    });
    mocks.getWorkspaceActor.mockResolvedValue({
      userId: "dev_viewer",
      accountId: "acct_test",
      role: "VIEWER",
      authorityLevel: 10
    });
    mocks.canManageMembers.mockReturnValue(false);

    const { PATCH } = await import("@/app/api/onboarding/account-setup/route");
    const response = await PATCH(
      jsonRequest("http://example.test/api/onboarding/account-setup", {
        method: "PATCH",
        body: JSON.stringify({ firstName: "View", lastName: "Only" })
      }) as never
    );
    expect(response.status).toBe(200);
    expect(mocks.DeveloperUser.updateOne).toHaveBeenCalled();
  });

  it("allows ENGINEERING_LEAD to update account-level fields", async () => {
    mocks.getWorkspaceActor.mockResolvedValue({
      userId: "dev_lead",
      accountId: "acct_test",
      role: "ENGINEERING_LEAD",
      authorityLevel: 80
    });
    mocks.canManageMembers.mockReturnValue(true);

    const { PATCH } = await import("@/app/api/onboarding/account-setup/route");
    const response = await PATCH(
      jsonRequest("http://example.test/api/onboarding/account-setup", {
        method: "PATCH",
        body: JSON.stringify({ companyName: "Updated Co" })
      }) as never
    );
    expect(response.status).toBe(200);
    expect(mocks.Account.updateOne).toHaveBeenCalled();
  });
});

describe("account setup routing", () => {
  it("signup success routes to onboarding in auth client", async () => {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const source = await readFile(join(process.cwd(), "app/auth-client.tsx"), "utf8");
    expect(source).toMatch(/\/onboarding/);
    expect(source).toContain("redirectPath");
  });
});
