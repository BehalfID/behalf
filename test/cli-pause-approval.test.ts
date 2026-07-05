/**
 * Tests for required-mode pause approval (managed profile pause approvals).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  policyFindOne: vi.fn(),
  accountFindOne: vi.fn(),
  pauseFind: vi.fn(),
  pauseCreate: vi.fn(),
  auditCreate: vi.fn(),
  approvalFindOne: vi.fn(),
  approvalFindOneAndUpdate: vi.fn(),
  approvalUpdateOne: vi.fn(),
  requireDeveloperSessionForPause: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/models/ManagedProfilePolicy", () => ({
  default: { findOne: mocks.policyFindOne },
}));
vi.mock("@/models/Account", () => ({
  default: { findOne: mocks.accountFindOne },
}));
vi.mock("@/models/CliPauseLease", () => ({
  default: {
    find: mocks.pauseFind,
    create: mocks.pauseCreate,
  },
}));
vi.mock("@/models/CliAuditLog", () => ({
  default: { create: mocks.auditCreate },
}));
vi.mock("@/models/ApprovalRequest", () => ({
  default: {
    findOne: mocks.approvalFindOne,
    findOneAndUpdate: mocks.approvalFindOneAndUpdate,
    updateOne: mocks.approvalUpdateOne,
  },
  APPROVAL_GRANT_TTL_MS: 30 * 60 * 1_000,
}));
vi.mock("@/lib/cliAuth", () => ({
  requireDeveloperSessionForPause: mocks.requireDeveloperSessionForPause,
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: vi.fn(),
}));

const sessionAuth = {
  userId: "user_a",
  accountId: "acct_test",
  agentId: null,
  source: "session" as const,
};

const requiredPolicyDoc = {
  policyId: "pprf_test",
  accountId: "acct_test",
  enabled: true,
  timezone: "UTC",
  workHours: { enabled: false, days: [1], start: "09:00", end: "17:00" },
  duringHoursMode: "managed",
  outsideHoursMode: "unmanaged",
  defaultMode: "required",
  toolModes: {},
  protectedRepos: [],
  pausePolicy: {
    enabled: true,
    reasonRequired: true,
    maxDurationMinutes: 240,
    allowAllRepos: true,
    requireApprovalForRequiredMode: false,
  },
};

function mockPolicy(overrides: Record<string, unknown> = {}) {
  mocks.policyFindOne.mockReturnValue({
    lean: vi.fn().mockResolvedValue({ ...requiredPolicyDoc, ...overrides }),
  });
}

function pauseInput(overrides: Record<string, unknown> = {}) {
  return {
    durationMinutes: 30,
    reason: "incident response",
    scope: "current_repo" as const,
    tool: "claude",
    repo: "0123456789abcdef",
    branch: "main",
    deviceId: "devmac_test",
    ...overrides,
  };
}

describe("required-mode pause approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.pauseFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mocks.accountFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        accountId: "acct_test",
        accountType: "individual",
        onboarding: {},
      }),
    });
    mocks.auditCreate.mockResolvedValue({});
    mocks.pauseCreate.mockResolvedValue({});
    mocks.approvalFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mocks.approvalFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ approvalId: "apr_test123" }),
    });
    mocks.approvalUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockPolicy();
  });

  describe("pause request", () => {
    it("denies required mode when approval is disabled", async () => {
      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const result = await requestCliPauseLease(sessionAuth, pauseInput());
      expect(result.granted).toBe(false);
      expect(result.mode).toBe("required");
      expect(result.approvalRequired).toBeUndefined();
      expect(mocks.approvalFindOneAndUpdate).not.toHaveBeenCalled();
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "cli_pause_deny" })
      );
    });

    it("creates approval request when required mode and approval enabled", async () => {
      mockPolicy({
        pausePolicy: {
          ...requiredPolicyDoc.pausePolicy,
          requireApprovalForRequiredMode: true,
        },
      });

      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const result = await requestCliPauseLease(sessionAuth, pauseInput());

      expect(result.granted).toBe(false);
      expect(result.approvalRequired).toBe(true);
      expect(result.approvalRequestId).toBe("apr_test123");
      expect(result.mode).toBe("required");
      expect(mocks.approvalFindOneAndUpdate).toHaveBeenCalledOnce();
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "cli_pause_approval_requested" })
      );
    });

    it("returns same approval id for duplicate pending request", async () => {
      mockPolicy({
        pausePolicy: {
          ...requiredPolicyDoc.pausePolicy,
          requireApprovalForRequiredMode: true,
        },
      });
      mocks.approvalFindOneAndUpdate.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ approvalId: "apr_existing" }),
      });

      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const input = pauseInput();
      const first = await requestCliPauseLease(sessionAuth, input);
      const second = await requestCliPauseLease(sessionAuth, input);

      expect(first.approvalRequestId).toBe("apr_existing");
      expect(second.approvalRequestId).toBe("apr_existing");
      expect(mocks.approvalFindOneAndUpdate).toHaveBeenCalledTimes(2);
    });

    it("grants pause in managed mode as before", async () => {
      mockPolicy({
        defaultMode: "managed",
        pausePolicy: {
          ...requiredPolicyDoc.pausePolicy,
          requireApprovalForRequiredMode: true,
        },
      });

      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const result = await requestCliPauseLease(sessionAuth, pauseInput());
      expect(result.granted).toBe(true);
      expect(mocks.pauseCreate).toHaveBeenCalled();
      expect(mocks.approvalFindOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("approval matching", () => {
    beforeEach(() => {
      mockPolicy({
        pausePolicy: {
          ...requiredPolicyDoc.pausePolicy,
          requireApprovalForRequiredMode: true,
        },
      });
    });

    it("grants pause lease when approved request matches", async () => {
      mocks.approvalFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          approvalId: "apr_granted",
          developerUserId: "user_a",
          pauseTool: "claude",
          pauseScope: "current_repo",
          pauseRepo: "0123456789abcdef",
          pauseDeviceId: "devmac_test",
          requestedDurationMinutes: 60,
          grantExpiresAt: new Date(Date.now() + 60_000),
        }),
      });

      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const result = await requestCliPauseLease(sessionAuth, pauseInput());

      expect(result.granted).toBe(true);
      expect(mocks.approvalUpdateOne).toHaveBeenCalledWith(
        expect.objectContaining({ approvalId: "apr_granted" }),
        expect.objectContaining({ $set: expect.objectContaining({ status: "used" }) })
      );
      expect(mocks.pauseCreate).toHaveBeenCalled();
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "cli_pause_grant" })
      );
    });

    it("consumes approved request only once", async () => {
      mocks.approvalFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          approvalId: "apr_once",
          developerUserId: "user_a",
          pauseTool: "claude",
          pauseScope: "current_repo",
          pauseRepo: "0123456789abcdef",
          pauseDeviceId: "devmac_test",
          requestedDurationMinutes: 60,
          grantExpiresAt: new Date(Date.now() + 60_000),
        }),
      });
      mocks.approvalUpdateOne
        .mockResolvedValueOnce({ matchedCount: 1 })
        .mockResolvedValueOnce({ matchedCount: 0 });

      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const input = pauseInput();
      const first = await requestCliPauseLease(sessionAuth, input);
      expect(first.granted).toBe(true);

      mocks.approvalFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      const second = await requestCliPauseLease(sessionAuth, input);
      expect(second.approvalRequired).toBe(true);
      expect(second.granted).toBe(false);
    });

    it("does not consume approval for wrong repo", async () => {
      mocks.approvalFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          approvalId: "apr_wrong_repo",
          developerUserId: "user_a",
          pauseTool: "claude",
          pauseScope: "current_repo",
          pauseRepo: "fedcba9876543210",
          pauseDeviceId: "devmac_test",
          requestedDurationMinutes: 60,
          grantExpiresAt: new Date(Date.now() + 60_000),
        }),
      });

      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const result = await requestCliPauseLease(sessionAuth, pauseInput());
      expect(result.approvalRequired).toBe(true);
      expect(mocks.pauseCreate).not.toHaveBeenCalled();
    });

    it("does not consume approval for wrong tool", async () => {
      mocks.approvalFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          approvalId: "apr_wrong_tool",
          developerUserId: "user_a",
          pauseTool: "codex",
          pauseScope: "current_repo",
          pauseRepo: "0123456789abcdef",
          pauseDeviceId: "devmac_test",
          requestedDurationMinutes: 60,
          grantExpiresAt: new Date(Date.now() + 60_000),
        }),
      });

      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const result = await requestCliPauseLease(sessionAuth, pauseInput());
      expect(result.approvalRequired).toBe(true);
      expect(mocks.pauseCreate).not.toHaveBeenCalled();
    });

    it("does not consume approval for wrong deviceId", async () => {
      mocks.approvalFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          approvalId: "apr_wrong_device",
          developerUserId: "user_a",
          pauseTool: "claude",
          pauseScope: "current_repo",
          pauseRepo: "0123456789abcdef",
          pauseDeviceId: "devmac_other",
          requestedDurationMinutes: 60,
          grantExpiresAt: new Date(Date.now() + 60_000),
        }),
      });

      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const result = await requestCliPauseLease(sessionAuth, pauseInput());
      expect(result.approvalRequired).toBe(true);
      expect(mocks.pauseCreate).not.toHaveBeenCalled();
    });

    it("rejects duration above approved amount", async () => {
      mocks.approvalFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          approvalId: "apr_duration",
          developerUserId: "user_a",
          pauseTool: "claude",
          pauseScope: "current_repo",
          pauseRepo: "0123456789abcdef",
          pauseDeviceId: "devmac_test",
          requestedDurationMinutes: 15,
          grantExpiresAt: new Date(Date.now() + 60_000),
        }),
      });

      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const result = await requestCliPauseLease(sessionAuth, pauseInput({ durationMinutes: 30 }));
      expect(result.approvalRequired).toBe(true);
      expect(mocks.pauseCreate).not.toHaveBeenCalled();
    });

    it("rejects expired approval grant", async () => {
      mocks.approvalFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      const { requestCliPauseLease } = await import("@/lib/cliSessionPolicy");
      const result = await requestCliPauseLease(sessionAuth, pauseInput());
      expect(result.approvalRequired).toBe(true);
      expect(mocks.pauseCreate).not.toHaveBeenCalled();
    });
  });

  describe("authorization", () => {
    it("viewer cannot approve pause requests", async () => {
      const { canApproveRequest } = await import("@/lib/delegatedAuth");
      const allowed = canApproveRequest(
        { userId: "viewer_a", accountId: "acct_test", role: "VIEWER", authorityLevel: 10 },
        {
          kind: "managed_profile_pause",
          action: "managed_profile_pause",
          vendor: "behalf_cli",
          requiredAuthorityLevel: 80,
          developerUserId: "user_a",
        }
      );
      expect(allowed).toBe(false);
    });

    it("requester cannot self-approve pause request", async () => {
      const { canApproveRequest } = await import("@/lib/delegatedAuth");
      const allowed = canApproveRequest(
        { userId: "user_a", accountId: "acct_test", role: "OWNER", authorityLevel: 100 },
        {
          kind: "managed_profile_pause",
          action: "managed_profile_pause",
          vendor: "behalf_cli",
          requiredAuthorityLevel: 80,
          developerUserId: "user_a",
        }
      );
      expect(allowed).toBe(false);
    });

    it("engineering lead can approve another user's pause request", async () => {
      const { canApproveRequest } = await import("@/lib/delegatedAuth");
      const allowed = canApproveRequest(
        {
          userId: "lead_a",
          accountId: "acct_test",
          role: "ENGINEERING_LEAD",
          authorityLevel: 80,
        },
        {
          kind: "managed_profile_pause",
          action: "managed_profile_pause",
          vendor: "behalf_cli",
          requiredAuthorityLevel: 80,
          developerUserId: "user_a",
        }
      );
      expect(allowed).toBe(true);
    });
  });

  describe("POST /api/cli/pause route", () => {
    beforeEach(() => {
      mocks.requireDeveloperSessionForPause.mockResolvedValue({
        auth: sessionAuth,
        error: null,
      });
    });

    it("returns structured approval response", async () => {
      mockPolicy({
        pausePolicy: {
          ...requiredPolicyDoc.pausePolicy,
          requireApprovalForRequiredMode: true,
        },
      });

      const { POST } = await import("@/app/api/cli/pause/route");
      const res = await POST(
        Object.assign(
          new Request("http://localhost/api/cli/pause", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pauseInput()),
          }),
          { nextUrl: new URL("http://localhost/api/cli/pause") }
        ) as never
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.approvalRequired).toBe(true);
      expect(body.approvalRequestId).toBe("apr_test123");
      expect(body.mode).toBe("required");
    });

    it("agent API key cannot create approval request via pause route", async () => {
      mocks.requireDeveloperSessionForPause.mockResolvedValue({
        auth: null,
        error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
      });

      const { POST } = await import("@/app/api/cli/pause/route");
      const res = await POST(
        Object.assign(
          new Request("http://localhost/api/cli/pause", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pauseInput()),
          }),
          { nextUrl: new URL("http://localhost/api/cli/pause") }
        ) as never
      );

      expect(res.status).toBe(403);
      expect(mocks.approvalFindOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});

describe("pauseApprovalMatchesRequest", () => {
  it("matches identical tuple", async () => {
    const { pauseApprovalMatchesRequest } = await import("@/lib/managedProfilePauseApproval");
    const match = pauseApprovalMatchesRequest(
      {
        developerUserId: "user_a",
        pauseTool: "claude",
        pauseScope: "current_repo",
        pauseRepo: "0123456789abcdef",
        pauseDeviceId: "devmac_test",
        requestedDurationMinutes: 60,
        grantExpiresAt: new Date(Date.now() + 60_000),
      },
      sessionAuth,
      pauseInput()
    );
    expect(match).toBe(true);
  });
});
