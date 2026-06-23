import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentFixture, permissionFixture } from "./fixtures";

const mocks = vi.hoisted(() => ({
  authenticateAgent: vi.fn(),
  checkRateLimit: vi.fn(),
  connectToDatabase: vi.fn(),
  permissionFind: vi.fn()
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authenticateAgent: mocks.authenticateAgent
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/lib/db", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/models/Permission", () => ({ default: { find: mocks.permissionFind } }));

function getRequest() {
  return new Request("http://localhost/api/agents/agent_test", {
    headers: { authorization: "Bearer bhf_sk_test_abcdefghijklmnopqrstuvwxyz123456" }
  }) as never;
}

function routeContext(agentId = "agent_test") {
  return { params: Promise.resolve({ agentId }) };
}

function mockPermissions(permissions: unknown[]) {
  const chain = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(permissions)
  };
  mocks.permissionFind.mockReturnValue(chain);
  return chain;
}

describe("GET /api/agents/[agentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAgent.mockResolvedValue({ agent: agentFixture(), error: null });
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mockPermissions([]);
  });

  it("returns agent + permissions in the dashboard detail shape using the agent key", async () => {
    mockPermissions([
      permissionFixture({ permissionId: "perm_read", action: "browse_web", status: "active" })
    ]);
    const { GET } = await import("@/app/api/agents/[agentId]/route");

    const response = await GET(getRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(body.agent).toMatchObject({ agentId: "agent_test", name: "Test Agent", status: "active" });
    expect(body.permissions).toHaveLength(1);
    expect(body.permissions[0]).toMatchObject({ permissionId: "perm_read", action: "browse_web" });
  });

  it("scopes the permission query to the authenticated agent's account", async () => {
    const { GET } = await import("@/app/api/agents/[agentId]/route");

    await GET(getRequest(), routeContext());

    expect(mocks.permissionFind).toHaveBeenCalledWith({ accountId: "acct_test", agentId: "agent_test" });
  });

  it("returns 401 when the agent key does not match", async () => {
    mocks.authenticateAgent.mockResolvedValue({ agent: null, error: "API key does not match this agent." });
    const { GET } = await import("@/app/api/agents/[agentId]/route");

    const response = await GET(getRequest(), routeContext());

    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown agent", async () => {
    mocks.authenticateAgent.mockResolvedValue({ agent: null, error: "Unknown agent." });
    const { GET } = await import("@/app/api/agents/[agentId]/route");

    const response = await GET(getRequest(), routeContext());

    expect(response.status).toBe(404);
  });
});
