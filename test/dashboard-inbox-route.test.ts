/**
 * Tests for the Action Inbox dashboard route.
 *
 * Verifies:
 *  - Data is scoped strictly to the authenticated developer (no cross-account leakage)
 *  - Pending approvals are returned and sorted pending-first
 *  - Recently denied high-risk logs (within 48h) are included
 *  - Agent names are enriched from the Agent model
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  findApprovals: vi.fn(),
  findLogs: vi.fn(),
  listAgents: vi.fn(),
  findUsers: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: routeMocks.requireDeveloperApi
}));

vi.mock("@/lib/delegatedAuth", () => ({
  getWorkspaceActor: routeMocks.getWorkspaceActor,
  enrichApprovalForActor: vi.fn((approval: unknown) => approval),
  serializeWorkspaceAuthority: vi.fn(() => ({ roleLabel: "Owner" }))
}));

vi.mock("@/lib/repositories/approvals", () => ({
  findApprovals: routeMocks.findApprovals
}));

vi.mock("@/lib/repositories/verificationLogs", () => ({
  findLogs: routeMocks.findLogs
}));

vi.mock("@/lib/repositories/agents", () => ({
  listAgents: routeMocks.listAgents
}));

vi.mock("@/lib/repositories/users", () => ({
  findUsers: routeMocks.findUsers
}));

function request(path = "/api/dashboard/inbox") {
  const url = new URL(`http://localhost${path}`);
  return Object.assign(new Request(url), { nextUrl: url }) as never;
}

function authOk(userId = "dev_test", accountId = "acct_test") {
  routeMocks.requireDeveloperApi.mockResolvedValue({
    user: { userId },
    activeAccountId: accountId,
    error: null
  });
  routeMocks.getWorkspaceActor.mockResolvedValue({
    userId,
    accountId,
    role: "OWNER",
    authorityLevel: 100
  });
}

const pendingApproval = {
  approvalId: "apr_pending",
  requestId: "req_pending",
  agentId: "agent_test",
  permissionId: "perm_test",
  action: "deploy_prod",
  vendor: "vercel.com",
  amount: null,
  status: "pending",
  resolvedBy: null,
  resolvedAt: null,
  grantExpiresAt: null,
  createdAt: new Date("2026-06-07T10:00:00.000Z")
};

const approvedApproval = {
  approvalId: "apr_approved",
  requestId: "req_approved",
  agentId: "agent_test",
  permissionId: "perm_test",
  action: "deploy_prod",
  vendor: "vercel.com",
  amount: null,
  status: "approved",
  resolvedBy: "dev_test",
  resolvedAt: new Date("2026-06-07T10:05:00.000Z"),
  grantExpiresAt: new Date("2026-06-07T10:35:00.000Z"),
  createdAt: new Date("2026-06-07T09:55:00.000Z")
};

const deniedHighRiskLog = {
  requestId: "req_denied_hr",
  agentId: "agent_test",
  permissionId: null,
  action: "purchase",
  vendor: "stripe.com",
  amount: 1200,
  allowed: false,
  approvalRequired: false,
  reason: "Amount exceeds maxAmount constraint.",
  risk: "high",
  metadata: null,
  createdAt: new Date("2026-06-07T09:00:00.000Z")
};

const agentRow = { agentId: "agent_test", name: "Claude Code" };

describe("GET /api/dashboard/inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.findUsers.mockResolvedValue([]);
  });

  it("requires authentication", async () => {
    const sentinel = new Response(null, { status: 401 });
    routeMocks.requireDeveloperApi.mockResolvedValue({ user: null, error: sentinel });

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());

    expect(res).toBe(sentinel);
    expect(routeMocks.findApprovals).not.toHaveBeenCalled();
  });

  it("returns pending approvals and denied high-risk logs for authenticated developer", async () => {
    authOk();
    routeMocks.findApprovals.mockResolvedValue([pendingApproval]);
    routeMocks.findLogs.mockResolvedValue([deniedHighRiskLog]);
    routeMocks.listAgents.mockResolvedValue([agentRow]);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());
    const body = (await res.json()) as { pendingApprovals: unknown[]; deniedHighRisk: unknown[] };

    expect(body.pendingApprovals).toHaveLength(1);
    expect(body.deniedHighRisk).toHaveLength(1);
  });

  it("scopes approval query to the active account", async () => {
    authOk("dev_abc", "acct_abc");
    routeMocks.findApprovals.mockResolvedValue([]);
    routeMocks.findLogs.mockResolvedValue([]);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    await GET(request());

    const [approvalFilter] = routeMocks.findApprovals.mock.calls[0];
    expect(approvalFilter.accountId).toBe("acct_abc");
  });

  it("scopes log query to the active account", async () => {
    authOk("dev_abc", "acct_abc");
    routeMocks.findApprovals.mockResolvedValue([]);
    routeMocks.findLogs.mockResolvedValue([]);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    await GET(request());

    const [logFilter] = routeMocks.findLogs.mock.calls[0];
    expect(logFilter.accountId).toBe("acct_abc");
  });

  it("queries only status pending and approved for approvals", async () => {
    authOk();
    routeMocks.findApprovals.mockResolvedValue([]);
    routeMocks.findLogs.mockResolvedValue([]);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    await GET(request());

    const [approvalFilter] = routeMocks.findApprovals.mock.calls[0];
    expect(approvalFilter.status.$in).toEqual(expect.arrayContaining(["pending", "approved"]));
    expect(approvalFilter.status.$in).toHaveLength(2);
  });

  it("queries only denied high-risk logs (allowed=false, risk=high)", async () => {
    authOk();
    routeMocks.findApprovals.mockResolvedValue([]);
    routeMocks.findLogs.mockResolvedValue([]);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    await GET(request());

    const [logFilter] = routeMocks.findLogs.mock.calls[0];
    expect(logFilter.allowed).toBe(false);
    expect(logFilter.risk).toBe("high");
    expect(logFilter.createdAt.$gte).toBeInstanceOf(Date);
  });

  it("attaches agent names to both pending approvals and denied logs", async () => {
    authOk();
    routeMocks.findApprovals.mockResolvedValue([pendingApproval]);
    routeMocks.findLogs.mockResolvedValue([deniedHighRiskLog]);
    routeMocks.listAgents.mockResolvedValue([agentRow]);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());
    const body = (await res.json()) as {
      pendingApprovals: Array<{ agentName: string }>;
      deniedHighRisk: Array<{ agentName: string }>;
    };

    expect(body.pendingApprovals[0].agentName).toBe("Claude Code");
    expect(body.deniedHighRisk[0].agentName).toBe("Claude Code");
  });

  it("sorts pending approvals before approved ones", async () => {
    authOk();
    routeMocks.findApprovals.mockResolvedValue([approvedApproval, pendingApproval]);
    routeMocks.findLogs.mockResolvedValue([]);
    routeMocks.listAgents.mockResolvedValue([agentRow]);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());
    const body = (await res.json()) as { pendingApprovals: Array<{ status: string }> };

    expect(body.pendingApprovals[0].status).toBe("pending");
    expect(body.pendingApprovals[1].status).toBe("approved");
  });

  it("returns empty arrays when there is nothing in the inbox", async () => {
    authOk();
    routeMocks.findApprovals.mockResolvedValue([]);
    routeMocks.findLogs.mockResolvedValue([]);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());
    const body = (await res.json()) as { pendingApprovals: unknown[]; deniedHighRisk: unknown[] };

    expect(body.pendingApprovals).toEqual([]);
    expect(body.deniedHighRisk).toEqual([]);
  });

  it("returns empty arrays when workspace actor is unavailable", async () => {
    routeMocks.requireDeveloperApi.mockResolvedValue({
      user: { userId: "dev_test" },
      activeAccountId: null,
      error: null
    });
    routeMocks.getWorkspaceActor.mockResolvedValue(null);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());
    const body = (await res.json()) as { pendingApprovals: unknown[]; deniedHighRisk: unknown[] };

    expect(body.pendingApprovals).toEqual([]);
    expect(body.deniedHighRisk).toEqual([]);
    expect(routeMocks.findApprovals).not.toHaveBeenCalled();
  });

  it("skips the agent name lookup when there are no results", async () => {
    authOk();
    routeMocks.findApprovals.mockResolvedValue([]);
    routeMocks.findLogs.mockResolvedValue([]);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    await GET(request());

    expect(routeMocks.listAgents).not.toHaveBeenCalled();
  });

  it("includes argument preview fields and does not expose policyContext", async () => {
    authOk();
    const boundApproval = {
      ...pendingApproval,
      action: "execute_command",
      argumentKind: "command",
      argumentPreview: "npm test",
      argumentPreviewTruncated: false
    };
    routeMocks.findApprovals.mockResolvedValue([boundApproval]);
    routeMocks.findLogs.mockResolvedValue([]);
    routeMocks.listAgents.mockResolvedValue([agentRow]);

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());
    const body = (await res.json()) as {
      pendingApprovals: Array<Record<string, unknown>>;
    };

    expect(body.pendingApprovals[0].argumentKind).toBe("command");
    expect(body.pendingApprovals[0].argumentPreview).toBe("npm test");
    expect(body.pendingApprovals[0].argumentPreviewTruncated).toBe(false);
    expect(body.pendingApprovals[0]).not.toHaveProperty("policyContext");
    expect(body.pendingApprovals[0]).not.toHaveProperty("argumentFingerprint");

    const selectArg = routeMocks.findApprovals.mock.calls[0][1].select as string;
    expect(selectArg).toContain("argumentKind");
    expect(selectArg).toContain("argumentPreview");
    expect(selectArg).not.toContain("argumentFingerprint");
    expect(selectArg).not.toContain("policyContext");
  });
});
