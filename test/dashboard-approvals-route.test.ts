/**
 * Tests for GET /api/dashboard/approvals and approve/deny routes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  canApproveRequest: vi.fn(),
  canDenyRequest: vi.fn(),
  findApprovals: vi.fn(),
  findOneApproval: vi.fn(),
  updateApproval: vi.fn(),
  listAgents: vi.fn(),
  findUsers: vi.fn()
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

vi.mock("@/lib/repositories/approvals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/approvals")>();
  return {
    ...actual,
    findApprovals: routeMocks.findApprovals,
    findOneApproval: routeMocks.findOneApproval,
    updateApproval: routeMocks.updateApproval
  };
});

vi.mock("@/lib/repositories/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/agents")>();
  return {
    ...actual,
    listAgents: routeMocks.listAgents
  };
});

vi.mock("@/lib/repositories/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/users")>();
  return {
    ...actual,
    findUsers: routeMocks.findUsers
  };
});

vi.mock("@/lib/approvals/emitLifecycle", () => ({
  emitApprovalRequested: vi.fn().mockResolvedValue(undefined),
  emitApprovalApproved: vi.fn().mockResolvedValue(undefined),
  emitApprovalDenied: vi.fn().mockResolvedValue(undefined),
  emitApprovalUsed: vi.fn().mockResolvedValue(undefined)
}));

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
    routeMocks.listAgents.mockResolvedValue([{ agentId: "agent_test", name: "Deploy Bot" }]);
    routeMocks.findUsers.mockResolvedValue([]);
  });

  it("returns only pending approvals by default", async () => {
    routeMocks.findApprovals.mockResolvedValue([pendingApproval]);
    const { GET } = await import("@/app/api/dashboard/approvals/route");
    const res = await GET(request("/api/dashboard/approvals"));
    const body = await res.json() as { approvals: unknown[] };

    expect(body.approvals).toHaveLength(1);
    expect(routeMocks.findApprovals.mock.calls[0][0]).toMatchObject({
      accountId: "acct_test",
      status: "pending"
    });
  });

  it("scopes approvals to active account and not another workspace", async () => {
    routeMocks.findApprovals.mockResolvedValue([]);
    const { GET } = await import("@/app/api/dashboard/approvals/route");
    await GET(request("/api/dashboard/approvals"));

    const [filter] = routeMocks.findApprovals.mock.calls[0];
    expect(filter.accountId).toBe("acct_test");
    expect(filter.accountId).not.toBe("acct_other");
  });

  it("returns empty list when workspace actor is unavailable", async () => {
    routeMocks.getWorkspaceActor.mockResolvedValue(null);
    const { GET } = await import("@/app/api/dashboard/approvals/route");
    const res = await GET(request("/api/dashboard/approvals"));
    const body = await res.json() as { approvals: unknown[] };

    expect(body.approvals).toEqual([]);
    expect(routeMocks.findApprovals).not.toHaveBeenCalled();
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
    routeMocks.findOneApproval.mockResolvedValue(pendingApproval);
    routeMocks.updateApproval.mockResolvedValue({ matchedCount: 1 });
  });

  it("approves a pending request scoped to the active account", async () => {
    const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/approve/route");
    const res = await POST(
      request("/api/dashboard/approvals/apr_pending/approve", { method: "POST" }),
      { params: Promise.resolve({ approvalId: "apr_pending" }) }
    );
    const body = await res.json() as { approved: boolean };

    expect(body.approved).toBe(true);
    expect(routeMocks.findOneApproval.mock.calls[0][0]).toMatchObject({
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
      routeMocks.findOneApproval.mockResolvedValue(selfRequestedApproval);

      const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/approve/route");
      const res = await POST(
        request("/api/dashboard/approvals/apr_pending/approve", { method: "POST" }),
        { params: Promise.resolve({ approvalId: "apr_pending" }) }
      );

      expect(res.status).toBe(403);
      expect(routeMocks.updateApproval).not.toHaveBeenCalled();
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
      routeMocks.findOneApproval.mockResolvedValue({
        ...pendingApproval,
        developerUserId: "dev_test",
        kind: "agent_action",
        requiredAuthorityLevel: 80
      });

      const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/approve/route");
      const res = await POST(
        request("/api/dashboard/approvals/apr_pending/approve", { method: "POST" }),
        { params: Promise.resolve({ approvalId: "apr_pending" }) }
      );
      const body = await res.json() as { approved: boolean };

      expect(res.status).toBe(200);
      expect(body.approved).toBe(true);
      expect(routeMocks.updateApproval).toHaveBeenCalled();
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
      routeMocks.findOneApproval.mockResolvedValue({
        ...pendingApproval,
        developerUserId: "dev_test",
        kind: "agent_action",
        requiredAuthorityLevel: 80
      });

      const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/approve/route");
      const res = await POST(
        request("/api/dashboard/approvals/apr_pending/approve", { method: "POST" }),
        { params: Promise.resolve({ approvalId: "apr_pending" }) }
      );

      expect(res.status).toBe(403);
      expect(routeMocks.updateApproval).not.toHaveBeenCalled();
    });

    it("rejects legacy unbound command/file approvals with conflict", async () => {
      routeMocks.findOneApproval.mockResolvedValue({
        ...pendingApproval,
        action: "execute_command",
        kind: "agent_action",
        developerUserId: "other_dev",
        argumentKind: null,
        argumentFingerprint: null,
        argumentPreview: null
      });

      const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/approve/route");
      const res = await POST(
        request("/api/dashboard/approvals/apr_pending/approve", { method: "POST" }),
        { params: Promise.resolve({ approvalId: "apr_pending" }) }
      );
      const body = await res.json() as { error: string };

      expect(res.status).toBe(409);
      expect(body.error).toMatch(/intent binding/i);
      expect(routeMocks.updateApproval).not.toHaveBeenCalled();
    });

    it("approves a bound command approval with fingerprint and preview", async () => {
      routeMocks.findOneApproval.mockResolvedValue({
        ...pendingApproval,
        action: "execute_command",
        kind: "agent_action",
        developerUserId: "other_dev",
        argumentKind: "command",
        argumentFingerprint: "a".repeat(64),
        argumentPreview: "npm test",
        argumentPreviewTruncated: false
      });

      const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/approve/route");
      const res = await POST(
        request("/api/dashboard/approvals/apr_pending/approve", { method: "POST" }),
        { params: Promise.resolve({ approvalId: "apr_pending" }) }
      );

      expect(res.status).toBe(200);
      expect(routeMocks.updateApproval).toHaveBeenCalled();
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
    routeMocks.findOneApproval.mockResolvedValue(pendingApproval);
    routeMocks.updateApproval.mockResolvedValue({ matchedCount: 1 });
  });

  it("denies a pending request scoped to the active account", async () => {
    const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/deny/route");
    const res = await POST(
      request("/api/dashboard/approvals/apr_pending/deny", { method: "POST" }),
      { params: Promise.resolve({ approvalId: "apr_pending" }) }
    );
    const body = await res.json() as { denied: boolean };

    expect(body.denied).toBe(true);
    expect(routeMocks.updateApproval.mock.calls[0][0]).toMatchObject({
      approvalId: "apr_pending",
      accountId: "acct_test",
      status: "pending"
    });
  });

  it("does not resolve approvals from another account", async () => {
    routeMocks.findOneApproval.mockResolvedValue(null);
    const { POST } = await import("@/app/api/dashboard/approvals/[approvalId]/deny/route");
    const res = await POST(
      request("/api/dashboard/approvals/apr_other/deny", { method: "POST" }),
      { params: Promise.resolve({ approvalId: "apr_other" }) }
    );

    expect(res.status).toBe(404);
  });
});
