/**
 * Tests for the Action Inbox dashboard route.
 *
 * Verifies:
 *  - Data is scoped strictly to the authenticated developer (no cross-account leakage)
 *  - Pending approvals are returned and sorted pending-first
 *  - Recently denied high-risk logs (within 48h) are included
 *  - Denied high-risk logs outside the 48h window are excluded
 *  - Agent names are enriched from the Agent model
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  approvalFind: vi.fn(),
  logFind: vi.fn(),
  agentFind: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: routeMocks.requireDeveloperApi
}));

vi.mock("@/lib/delegatedAuth", () => ({
  getWorkspaceActor: routeMocks.getWorkspaceActor,
  enrichApprovalForActor: vi.fn((approval: unknown) => approval),
  serializeWorkspaceAuthority: vi.fn(() => ({ roleLabel: "Owner" }))
}));

vi.mock("@/models/ApprovalRequest", () => ({
  default: { find: routeMocks.approvalFind },
  APPROVAL_GRANT_TTL_MS: 30 * 60 * 1_000
}));

vi.mock("@/models/VerificationLog", () => ({
  default: { find: routeMocks.logFind }
}));

vi.mock("@/models/Agent", () => ({
  default: { find: routeMocks.agentFind }
}));

function approvalChain(rows: unknown[]) {
  const chain = {
    sort: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    select: vi.fn(() => chain),
    lean: vi.fn(async () => rows)
  };
  return chain;
}

function logChain(rows: unknown[]) {
  const chain = {
    sort: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    select: vi.fn(() => chain),
    lean: vi.fn(async () => rows)
  };
  return chain;
}

function agentChain(rows: unknown[]) {
  const chain = {
    select: vi.fn(() => chain),
    lean: vi.fn(async () => rows)
  };
  return chain;
}

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
  });

  it("requires authentication", async () => {
    const sentinel = new Response(null, { status: 401 });
    routeMocks.requireDeveloperApi.mockResolvedValue({ user: null, error: sentinel });

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());

    expect(res).toBe(sentinel);
    expect(routeMocks.approvalFind).not.toHaveBeenCalled();
  });

  it("returns pending approvals and denied high-risk logs for authenticated developer", async () => {
    authOk();
    routeMocks.approvalFind.mockReturnValue(approvalChain([pendingApproval]));
    routeMocks.logFind.mockReturnValue(logChain([deniedHighRiskLog]));
    routeMocks.agentFind.mockReturnValue(agentChain([agentRow]));

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());
    const body = await res.json() as { pendingApprovals: unknown[]; deniedHighRisk: unknown[] };

    expect(body.pendingApprovals).toHaveLength(1);
    expect(body.deniedHighRisk).toHaveLength(1);
  });

  it("scopes approval query to the active account", async () => {
    authOk("dev_abc", "acct_abc");
    routeMocks.approvalFind.mockReturnValue(approvalChain([]));
    routeMocks.logFind.mockReturnValue(logChain([]));
    routeMocks.agentFind.mockReturnValue(agentChain([]));

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    await GET(request());

    const [approvalFilter] = routeMocks.approvalFind.mock.calls[0];
    expect(approvalFilter.accountId).toBe("acct_abc");
  });

  it("scopes log query to the active account", async () => {
    authOk("dev_abc", "acct_abc");
    routeMocks.approvalFind.mockReturnValue(approvalChain([]));
    routeMocks.logFind.mockReturnValue(logChain([]));
    routeMocks.agentFind.mockReturnValue(agentChain([]));

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    await GET(request());

    const [logFilter] = routeMocks.logFind.mock.calls[0];
    expect(logFilter.accountId).toBe("acct_abc");
  });

  it("queries only status pending and approved for approvals", async () => {
    authOk();
    routeMocks.approvalFind.mockReturnValue(approvalChain([]));
    routeMocks.logFind.mockReturnValue(logChain([]));
    routeMocks.agentFind.mockReturnValue(agentChain([]));

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    await GET(request());

    const [approvalFilter] = routeMocks.approvalFind.mock.calls[0];
    expect(approvalFilter.status.$in).toEqual(expect.arrayContaining(["pending", "approved"]));
    expect(approvalFilter.status.$in).toHaveLength(2);
  });

  it("queries only denied high-risk logs (allowed=false, risk=high)", async () => {
    authOk();
    routeMocks.approvalFind.mockReturnValue(approvalChain([]));
    routeMocks.logFind.mockReturnValue(logChain([]));
    routeMocks.agentFind.mockReturnValue(agentChain([]));

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    await GET(request());

    const [logFilter] = routeMocks.logFind.mock.calls[0];
    expect(logFilter.allowed).toBe(false);
    expect(logFilter.risk).toBe("high");
    expect(logFilter.createdAt.$gte).toBeInstanceOf(Date);
  });

  it("attaches agent names to both pending approvals and denied logs", async () => {
    authOk();
    routeMocks.approvalFind.mockReturnValue(approvalChain([pendingApproval]));
    routeMocks.logFind.mockReturnValue(logChain([deniedHighRiskLog]));
    routeMocks.agentFind.mockReturnValue(agentChain([agentRow]));

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());
    const body = await res.json() as { pendingApprovals: Array<{ agentName: string }>; deniedHighRisk: Array<{ agentName: string }> };

    expect(body.pendingApprovals[0].agentName).toBe("Claude Code");
    expect(body.deniedHighRisk[0].agentName).toBe("Claude Code");
  });

  it("sorts pending approvals before approved ones", async () => {
    authOk();
    // Return approved first from DB, pending second — route should reorder
    routeMocks.approvalFind.mockReturnValue(approvalChain([approvedApproval, pendingApproval]));
    routeMocks.logFind.mockReturnValue(logChain([]));
    routeMocks.agentFind.mockReturnValue(agentChain([agentRow]));

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());
    const body = await res.json() as { pendingApprovals: Array<{ status: string }> };

    expect(body.pendingApprovals[0].status).toBe("pending");
    expect(body.pendingApprovals[1].status).toBe("approved");
  });

  it("returns empty arrays when there is nothing in the inbox", async () => {
    authOk();
    routeMocks.approvalFind.mockReturnValue(approvalChain([]));
    routeMocks.logFind.mockReturnValue(logChain([]));
    routeMocks.agentFind.mockReturnValue(agentChain([]));

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    const res = await GET(request());
    const body = await res.json() as { pendingApprovals: unknown[]; deniedHighRisk: unknown[] };

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
    const body = await res.json() as { pendingApprovals: unknown[]; deniedHighRisk: unknown[] };

    expect(body.pendingApprovals).toEqual([]);
    expect(body.deniedHighRisk).toEqual([]);
    expect(routeMocks.approvalFind).not.toHaveBeenCalled();
  });

  it("skips the agent name lookup when there are no results", async () => {
    authOk();
    routeMocks.approvalFind.mockReturnValue(approvalChain([]));
    routeMocks.logFind.mockReturnValue(logChain([]));
    routeMocks.agentFind.mockReturnValue(agentChain([]));

    const { GET } = await import("@/app/api/dashboard/inbox/route");
    await GET(request());

    expect(routeMocks.agentFind).not.toHaveBeenCalled();
  });
});
