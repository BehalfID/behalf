/**
 * Tests for GET /api/dashboard/approvals and approve/deny routes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  canApproveRequest: vi.fn(),
  canDenyRequest: vi.fn(),
  approvalFind: vi.fn(),
  approvalFindOne: vi.fn(),
  approvalUpdateOne: vi.fn(),
  agentFind: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: routeMocks.requireDeveloperApi
}));

vi.mock("@/lib/delegatedAuth", () => ({
  getWorkspaceActor: routeMocks.getWorkspaceActor,
  enrichApprovalForActor: vi.fn((approval: unknown) => approval),
  serializeWorkspaceAuthority: vi.fn(() => ({ roleLabel: "Owner" })),
  canApproveRequest: routeMocks.canApproveRequest,
  canDenyRequest: routeMocks.canDenyRequest,
  approvalForbidden: vi.fn(() => new Response(null, { status: 403 })),
  approvalDenyForbidden: vi.fn(() => new Response(null, { status: 403 })),
  viewerMutationForbidden: vi.fn(() => new Response(null, { status: 403 }))
}));

vi.mock("@/models/ApprovalRequest", () => ({
  default: {
    find: routeMocks.approvalFind,
    findOne: routeMocks.approvalFindOne,
    updateOne: routeMocks.approvalUpdateOne
  },
  APPROVAL_GRANT_TTL_MS: 30 * 60 * 1_000
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

function agentChain(rows: unknown[]) {
  const chain = {
    select: vi.fn(() => chain),
    lean: vi.fn(async () => rows)
  };
  return chain;
}

function request(path: string, init?: RequestInit) {
  const url = new URL(`http://localhost${path}`);
  return Object.assign(new Request(url, init), { nextUrl: url }) as never;
}

const actor = {
  userId: "dev_test",
  accountId: "acct_test",
  role: "OWNER",
  authorityLevel: 100
};

const pendingApproval = {
  approvalId: "apr_pending",
  requestId: "req_pending",
  agentId: "agent_test",
  permissionId: "perm_test",
  action: "deploy_prod",
  vendor: "vercel.com",
  amount: null,
  status: "pending",
  createdAt: new Date("2026-06-07T10:00:00.000Z")
};

describe("GET /api/dashboard/approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireDeveloperApi.mockResolvedValue({
      user: { userId: "dev_test" },
      activeAccountId: "acct_test",
      error: null
    });
    routeMocks.getWorkspaceActor.mockResolvedValue(actor);
    routeMocks.agentFind.mockReturnValue(agentChain([{ agentId: "agent_test", name: "Deploy Bot" }]));
  });

  it("returns only pending approvals by default", async () => {
    routeMocks.approvalFind.mockReturnValue(approvalChain([pendingApproval]));
    const { GET } = await import("@/app/api/dashboard/approvals/route");
    const res = await GET(request("/api/dashboard/approvals"));
    const body = await res.json() as { approvals: unknown[] };

    expect(body.approvals).toHaveLength(1);
    expect(routeMocks.approvalFind.mock.calls[0][0]).toMatchObject({
      accountId: "acct_test",
      status: "pending"
    });
  });

  it("scopes approvals to active account and not another workspace", async () => {
    routeMocks.approvalFind.mockReturnValue(approvalChain([]));
    const { GET } = await import("@/app/api/dashboard/approvals/route");
    await GET(request("/api/dashboard/approvals"));

    const [filter] = routeMocks.approvalFind.mock.calls[0];
    expect(filter.accountId).toBe("acct_test");
    expect(filter.accountId).not.toBe("acct_other");
  });

  it("returns empty list when workspace actor is unavailable", async () => {
    routeMocks.getWorkspaceActor.mockResolvedValue(null);
    const { GET } = await import("@/app/api/dashboard/approvals/route");
    const res = await GET(request("/api/dashboard/approvals"));
    const body = await res.json() as { approvals: unknown[] };

    expect(body.approvals).toEqual([]);
    expect(routeMocks.approvalFind).not.toHaveBeenCalled();
  });
});

describe("POST /api/dashboard/approvals/[approvalId]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireDeveloperApi.mockResolvedValue({
      user: { userId: "dev_test" },
      activeAccountId: "acct_test",
      error: null
    });
    routeMocks.getWorkspaceActor.mockResolvedValue(actor);
    routeMocks.canApproveRequest.mockReturnValue(true);
    routeMocks.approvalFindOne.mockReturnValue({
      lean: vi.fn(async () => pendingApproval)
    });
    routeMocks.approvalUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("approves a pending request scoped to the active account", async () => {
    const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/approve/route");
    const res = await POST(
      request("/api/dashboard/approvals/apr_pending/approve", { method: "POST" }),
      { params: Promise.resolve({ approvalId: "apr_pending" }) }
    );
    const body = await res.json() as { approved: boolean };

    expect(body.approved).toBe(true);
    expect(routeMocks.approvalFindOne.mock.calls[0][0]).toMatchObject({
      approvalId: "apr_pending",
      accountId: "acct_test",
      status: "pending"
    });
  });

  describe("self-approval enforcement", () => {
    beforeEach(async () => {
      const actual = await vi.importActual<typeof import("@/lib/delegatedAuth")>("@/lib/delegatedAuth");
      routeMocks.canApproveRequest.mockImplementation(actual.canApproveRequest);
    });

    it("rejects self-approval for the requester even when they are OWNER", async () => {
      const selfRequestedApproval = {
        ...pendingApproval,
        developerUserId: "dev_test",
        kind: "agent_action"
      };
      routeMocks.approvalFindOne.mockReturnValue({
        lean: vi.fn(async () => selfRequestedApproval)
      });

      const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/approve/route");
      const res = await POST(
        request("/api/dashboard/approvals/apr_pending/approve", { method: "POST" }),
        { params: Promise.resolve({ approvalId: "apr_pending" }) }
      );

      expect(res.status).toBe(403);
      expect(routeMocks.approvalUpdateOne).not.toHaveBeenCalled();
    });

    it("allows a different eligible approver to approve the request", async () => {
      const leadActor = {
        userId: "lead_user",
        accountId: "acct_test",
        role: "ENGINEERING_LEAD",
        authorityLevel: 80
      };
      routeMocks.requireDeveloperApi.mockResolvedValue({
        user: { userId: "lead_user" },
        activeAccountId: "acct_test",
        error: null
      });
      routeMocks.getWorkspaceActor.mockResolvedValue(leadActor);
      routeMocks.approvalFindOne.mockReturnValue({
        lean: vi.fn(async () => ({
          ...pendingApproval,
          developerUserId: "dev_test",
          kind: "agent_action",
          requiredAuthorityLevel: 80
        }))
      });

      const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/approve/route");
      const res = await POST(
        request("/api/dashboard/approvals/apr_pending/approve", { method: "POST" }),
        { params: Promise.resolve({ approvalId: "apr_pending" }) }
      );
      const body = await res.json() as { approved: boolean };

      expect(res.status).toBe(200);
      expect(body.approved).toBe(true);
      expect(routeMocks.approvalUpdateOne).toHaveBeenCalled();
    });

    it("rejects approvers with insufficient authority", async () => {
      const engineerActor = {
        userId: "engineer_user",
        accountId: "acct_test",
        role: "ENGINEER",
        authorityLevel: 40
      };
      routeMocks.requireDeveloperApi.mockResolvedValue({
        user: { userId: "engineer_user" },
        activeAccountId: "acct_test",
        error: null
      });
      routeMocks.getWorkspaceActor.mockResolvedValue(engineerActor);
      routeMocks.approvalFindOne.mockReturnValue({
        lean: vi.fn(async () => ({
          ...pendingApproval,
          developerUserId: "dev_test",
          kind: "agent_action",
          requiredAuthorityLevel: 80
        }))
      });

      const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/approve/route");
      const res = await POST(
        request("/api/dashboard/approvals/apr_pending/approve", { method: "POST" }),
        { params: Promise.resolve({ approvalId: "apr_pending" }) }
      );

      expect(res.status).toBe(403);
      expect(routeMocks.approvalUpdateOne).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/dashboard/approvals/[approvalId]/deny", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireDeveloperApi.mockResolvedValue({
      user: { userId: "dev_test" },
      activeAccountId: "acct_test",
      error: null
    });
    routeMocks.getWorkspaceActor.mockResolvedValue(actor);
    routeMocks.canDenyRequest.mockReturnValue(true);
    routeMocks.approvalFindOne.mockReturnValue({
      lean: vi.fn(async () => pendingApproval)
    });
    routeMocks.approvalUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("denies a pending request scoped to the active account", async () => {
    const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/deny/route");
    const res = await POST(
      request("/api/dashboard/approvals/apr_pending/deny", { method: "POST" }),
      { params: Promise.resolve({ approvalId: "apr_pending" }) }
    );
    const body = await res.json() as { denied: boolean };

    expect(body.denied).toBe(true);
    expect(routeMocks.approvalUpdateOne.mock.calls[0][0]).toMatchObject({
      approvalId: "apr_pending",
      accountId: "acct_test",
      status: "pending"
    });
  });

  it("does not resolve approvals from another account", async () => {
    routeMocks.approvalFindOne.mockReturnValue({
      lean: vi.fn(async () => null)
    });
    const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/deny/route");
    const res = await POST(
      request("/api/dashboard/approvals/apr_other/deny", { method: "POST" }),
      { params: Promise.resolve({ approvalId: "apr_other" }) }
    );

    expect(res.status).toBe(404);
  });
});
