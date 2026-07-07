/**
 * Verifies that authenticated dashboard API routes set Cache-Control: no-store, private
 * so user-specific data is never cached by CDNs or shared caches.
 *
 * Also checks that the /api/dashboard/summary response includes the onboardingUseCase
 * field so the HomeView doesn't need a separate /api/auth/me round trip.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountFixture, developerUserFixture } from "./fixtures";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  loadAccountSetupState: vi.fn(),
  agentCountDocuments: vi.fn(),
  permissionCountDocuments: vi.fn(),
  verificationLogCountDocuments: vi.fn(),
  webhookEventCountDocuments: vi.fn(),
  agentFind: vi.fn(),
  webhookEndpointFind: vi.fn(),
  siteFind: vi.fn(),
  tokenFind: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: mocks.requireDeveloperApi
}));
vi.mock("@/lib/delegatedAuth", () => ({
  getWorkspaceActor: mocks.getWorkspaceActor,
  serializeWorkspaceAuthority: vi.fn(() => ({ roleLabel: "Owner" })),
  canManageMembers: vi.fn(() => true)
}));
vi.mock("@/lib/accountSetup", () => ({
  loadAccountSetupState: mocks.loadAccountSetupState,
  patchAccountSetup: vi.fn(),
  PATCH_ALLOWED_FIELDS: []
}));
vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/models/Agent", () => ({
  default: {
    countDocuments: mocks.agentCountDocuments,
    find: mocks.agentFind,
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 })
  }
}));
vi.mock("@/models/Permission", () => ({
  default: { countDocuments: mocks.permissionCountDocuments }
}));
vi.mock("@/models/VerificationLog", () => ({
  default: {
    countDocuments: mocks.verificationLogCountDocuments,
    aggregate: vi.fn().mockResolvedValue([{
      stats: [{ total: 0, allowed: 0, denied: 0, highRisk: 0, approvalRequired: 0 }],
      deniedActions: [],
      topVendors: []
    }]),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    })
  }
}));
vi.mock("@/models/WebhookEvent", () => ({
  default: { countDocuments: mocks.webhookEventCountDocuments }
}));
vi.mock("@/models/WebhookEndpoint", () => ({
  default: {
    find: mocks.webhookEndpointFind
  }
}));
vi.mock("@/models/Site", () => ({
  default: { find: mocks.siteFind }
}));
vi.mock("@/models/AccountMembership", () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(1) }
}));
vi.mock("@/models/ManagedProfilePolicy", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null)
    })
  }
}));
vi.mock("@/models/DeveloperApiToken", () => ({
  default: {
    find: mocks.tokenFind,
    countDocuments: vi.fn().mockResolvedValue(0)
  }
}));

function getRequest(path: string) {
  const url = new URL(`http://localhost${path}`);
  // Attach nextUrl so routes that read request.nextUrl.origin work in tests.
  return Object.assign(new Request(url), { nextUrl: url }) as never;
}

describe("dashboard API cache headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const user = developerUserFixture({ primaryAccountId: "acct_test", onboardingUseCase: "sdk" });
    const account = accountFixture({ plan: "free" });
    mocks.requireDeveloperApi.mockResolvedValue({ user, account, error: null });
    mocks.agentCountDocuments.mockResolvedValue(0);
    mocks.permissionCountDocuments.mockResolvedValue(0);
    mocks.verificationLogCountDocuments.mockResolvedValue(0);
    mocks.webhookEventCountDocuments.mockResolvedValue(0);

    const chainMock = () => ({
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });
    mocks.agentFind.mockReturnValue(chainMock());
    mocks.webhookEndpointFind.mockReturnValue(chainMock());
    mocks.siteFind.mockReturnValue(chainMock());
    mocks.tokenFind.mockReturnValue(chainMock());
    mocks.getWorkspaceActor.mockResolvedValue({
      userId: "dev_test",
      accountId: "acct_test",
      role: "OWNER",
      authorityLevel: 100
    });
    mocks.loadAccountSetupState.mockResolvedValue({
      profile: {
        firstName: null,
        lastName: null,
        email: "dev@example.com",
        emailVerified: true,
        jobTitle: null,
        phone: null
      },
      account: {
        accountId: "acct_test",
        accountType: null,
        companyName: null,
        workspaceName: "Test Account",
        website: null,
        teamSize: null,
        onboarding: null,
        legacyAccountType: null
      },
      onboardingCompletedAt: null,
      membershipRole: "OWNER"
    });
  });

  it("summary route: Cache-Control is no-store, private", async () => {
    const { GET } = await import("@/app/api/dashboard/summary/route");
    const response = await GET(getRequest("/api/dashboard/summary"));
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.status).toBe(200);
  });

  it("summary route: includes onboardingUseCase to avoid a separate /api/auth/me call", async () => {
    const { GET } = await import("@/app/api/dashboard/summary/route");
    const response = await GET(getRequest("/api/dashboard/summary"));
    const json = await response.json();
    expect(json).toHaveProperty("onboardingUseCase", "sdk");
  });

  it("summary route: onboardingUseCase is null when not set", async () => {
    const user = developerUserFixture({ primaryAccountId: "acct_test" }); // no onboardingUseCase
    mocks.requireDeveloperApi.mockResolvedValue({
      user,
      account: accountFixture(),
      error: null
    });
    const { GET } = await import("@/app/api/dashboard/summary/route");
    const response = await GET(getRequest("/api/dashboard/summary"));
    const json = await response.json();
    expect(json).toHaveProperty("onboardingUseCase", null);
  });

  it("agents route: Cache-Control is no-store, private", async () => {
    const { GET } = await import("@/app/api/dashboard/agents/route");
    const response = await GET(getRequest("/api/dashboard/agents"));
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("sites route: Cache-Control is no-store, private", async () => {
    const { GET } = await import("@/app/api/dashboard/sites/route");
    const response = await GET(getRequest("/api/dashboard/sites"));
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("tokens route: Cache-Control is no-store, private", async () => {
    const { GET } = await import("@/app/api/dashboard/tokens/route");
    const response = await GET(getRequest("/api/dashboard/tokens"));
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("settings route: Cache-Control is no-store, private", async () => {
    const { GET } = await import("@/app/api/dashboard/settings/route");
    const response = await GET(getRequest("/api/dashboard/settings"));
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("webhooks route: Cache-Control is no-store, private", async () => {
    const { GET } = await import("@/app/api/dashboard/webhooks/route");
    const response = await GET(getRequest("/api/dashboard/webhooks"));
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });
});
