import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  getAgentSetupReadiness: vi.fn(),
  getWorkspaceProtectionStatus: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: mocks.requireDeveloperApi
}));
vi.mock("@/lib/delegatedAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/delegatedAuth")>();
  return { ...actual, getWorkspaceActor: mocks.getWorkspaceActor };
});
vi.mock("@/lib/setupReadiness", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/setupReadiness")>();
  return {
    ...actual,
    getAgentSetupReadiness: mocks.getAgentSetupReadiness,
    getWorkspaceProtectionStatus: mocks.getWorkspaceProtectionStatus
  };
});

function getRequest(url = "http://example.test/api/dashboard/protection-status") {
  return new Request(url) as never;
}

function agentContext(agentId: string) {
  return { params: Promise.resolve({ agentId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireDeveloperApi.mockResolvedValue({
    user: { userId: "dev_test", email: "dev@example.com" },
    activeAccountId: "acct_test",
    error: null
  });
  mocks.getWorkspaceActor.mockResolvedValue({
    userId: "dev_test",
    accountId: "acct_test",
    role: "OWNER",
    authorityLevel: 100
  });
  mocks.getAgentSetupReadiness.mockResolvedValue({ agentId: "agent_test", state: "verified" });
  mocks.getWorkspaceProtectionStatus.mockResolvedValue([]);
});

describe("GET /api/dashboard/agents/[agentId]/setup-status", () => {
  it("requires an authenticated developer", async () => {
    mocks.requireDeveloperApi.mockResolvedValue({
      user: null,
      error: Response.json({ error: "Unauthorized" }, { status: 401 })
    });
    const { GET } = await import("@/app/api/dashboard/agents/[agentId]/setup-status/route");
    const response = await GET(getRequest(), agentContext("agent_test"));
    expect(response.status).toBe(401);
    expect(mocks.getAgentSetupReadiness).not.toHaveBeenCalled();
  });

  it("requires a workspace membership", async () => {
    mocks.getWorkspaceActor.mockResolvedValue(null);
    const { GET } = await import("@/app/api/dashboard/agents/[agentId]/setup-status/route");
    const response = await GET(getRequest(), agentContext("agent_test"));
    expect(response.status).toBe(403);
    expect(mocks.getAgentSetupReadiness).not.toHaveBeenCalled();
  });

  it("reads readiness with the actor's own account, never a client-supplied one", async () => {
    const { GET } = await import("@/app/api/dashboard/agents/[agentId]/setup-status/route");
    const response = await GET(getRequest(), agentContext("agent_test"));
    expect(response.status).toBe(200);
    expect(mocks.getAgentSetupReadiness).toHaveBeenCalledWith("acct_test", "agent_test");
  });

  it("404s for an agent outside the workspace instead of confirming it exists", async () => {
    mocks.getAgentSetupReadiness.mockResolvedValue(null);
    const { GET } = await import("@/app/api/dashboard/agents/[agentId]/setup-status/route");
    const response = await GET(getRequest(), agentContext("agent_someone_else"));
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(JSON.stringify(json)).not.toContain("agent_someone_else");
  });

  it("is never cached, so a returning user sees live state", async () => {
    const { GET } = await import("@/app/api/dashboard/agents/[agentId]/setup-status/route");
    const response = await GET(getRequest(), agentContext("agent_test"));
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
  });
});

describe("GET /api/dashboard/protection-status", () => {
  it("requires an authenticated developer with a workspace", async () => {
    mocks.getWorkspaceActor.mockResolvedValue(null);
    const { GET } = await import("@/app/api/dashboard/protection-status/route");
    expect((await GET(getRequest())).status).toBe(403);
    expect(mocks.getWorkspaceProtectionStatus).not.toHaveBeenCalled();
  });

  it("scopes the surface list to the actor's account", async () => {
    const { GET } = await import("@/app/api/dashboard/protection-status/route");
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    expect(mocks.getWorkspaceProtectionStatus).toHaveBeenCalledWith("acct_test");
  });
});
