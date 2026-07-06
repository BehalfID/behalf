/**
 * Tests for GET /api/cli/pause/approvals/:approvalRequestId
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  approvalFindOne: vi.fn(),
  requireDeveloperSessionForPause: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/models/ApprovalRequest", () => ({
  default: { findOne: mocks.approvalFindOne },
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

function pauseApprovalDoc(overrides: Record<string, unknown> = {}) {
  return {
    approvalId: "apr_status_test",
    accountId: "acct_test",
    developerUserId: "user_a",
    kind: "managed_profile_pause",
    status: "pending",
    contextReason: "Pause requires approval for this required managed profile context.",
    grantExpiresAt: null,
    ...overrides,
  };
}

function makeGetRequest(approvalRequestId: string) {
  return Object.assign(
    new Request(`http://localhost/api/cli/pause/approvals/${approvalRequestId}`, {
      method: "GET",
    }),
    { nextUrl: new URL(`http://localhost/api/cli/pause/approvals/${approvalRequestId}`) }
  ) as never;
}

describe("GET /api/cli/pause/approvals/:approvalRequestId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.requireDeveloperSessionForPause.mockResolvedValue({
      auth: sessionAuth,
      error: null,
    });
    mocks.approvalFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(pauseApprovalDoc()),
    });
  });

  it("rejects unauthenticated approval status requests", async () => {
    mocks.requireDeveloperSessionForPause.mockResolvedValue({
      auth: null,
      error: new Response(JSON.stringify({ error: "Developer authentication required." }), {
        status: 401,
      }),
    });

    const { GET } = await import("@/app/api/cli/pause/approvals/[approvalRequestId]/route");
    const res = await GET(makeGetRequest("apr_status_test"), {
      params: Promise.resolve({ approvalRequestId: "apr_status_test" }),
    });

    expect(res.status).toBe(401);
    expect(mocks.approvalFindOne).not.toHaveBeenCalled();
  });

  it("rejects agent API key for approval status", async () => {
    mocks.requireDeveloperSessionForPause.mockResolvedValue({
      auth: null,
      error: new Response(JSON.stringify({ error: "Pause leases require a developer session." }), {
        status: 403,
      }),
    });

    const { GET } = await import("@/app/api/cli/pause/approvals/[approvalRequestId]/route");
    const res = await GET(makeGetRequest("apr_status_test"), {
      params: Promise.resolve({ approvalRequestId: "apr_status_test" }),
    });

    expect(res.status).toBe(403);
    expect(mocks.approvalFindOne).not.toHaveBeenCalled();
  });

  it("lets requester read own pause approval status", async () => {
    const { GET } = await import("@/app/api/cli/pause/approvals/[approvalRequestId]/route");
    const res = await GET(makeGetRequest("apr_status_test"), {
      params: Promise.resolve({ approvalRequestId: "apr_status_test" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      approvalRequestId: "apr_status_test",
      status: "pending",
      grantExpiresAt: null,
      reason: "Pause requires approval for this required managed profile context.",
    });
    expect(mocks.approvalFindOne).toHaveBeenCalledWith({
      approvalId: "apr_status_test",
      accountId: "acct_test",
      developerUserId: "user_a",
      kind: "managed_profile_pause",
    });
  });

  it("hides pause approval from a different requester", async () => {
    mocks.approvalFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const { GET } = await import("@/app/api/cli/pause/approvals/[approvalRequestId]/route");
    const res = await GET(makeGetRequest("apr_other_user"), {
      params: Promise.resolve({ approvalRequestId: "apr_other_user" }),
    });

    expect(res.status).toBe(404);
  });

  it("hides pause approval from a different account", async () => {
    mocks.approvalFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const { GET } = await import("@/app/api/cli/pause/approvals/[approvalRequestId]/route");
    const res = await GET(makeGetRequest("apr_other_account"), {
      params: Promise.resolve({ approvalRequestId: "apr_other_account" }),
    });

    expect(res.status).toBe(404);
    expect(mocks.approvalFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct_test" })
    );
  });

  it("returns expired when approved grant is past grantExpiresAt", async () => {
    mocks.approvalFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(
        pauseApprovalDoc({
          status: "approved",
          grantExpiresAt: new Date(Date.now() - 60_000),
        })
      ),
    });

    const { GET } = await import("@/app/api/cli/pause/approvals/[approvalRequestId]/route");
    const res = await GET(makeGetRequest("apr_status_test"), {
      params: Promise.resolve({ approvalRequestId: "apr_status_test" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("expired");
    expect(body.grantExpiresAt).toBeTruthy();
  });

  it("rejects or hides non-pause approval ids", async () => {
    mocks.approvalFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const { GET } = await import("@/app/api/cli/pause/approvals/[approvalRequestId]/route");
    const res = await GET(makeGetRequest("apr_agent_action"), {
      params: Promise.resolve({ approvalRequestId: "apr_agent_action" }),
    });

    expect(res.status).toBe(404);
    expect(mocks.approvalFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "managed_profile_pause" })
    );
  });
});

describe("getPauseApprovalStatusForRequester", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.approvalFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(pauseApprovalDoc({ status: "used" })),
    });
  });

  it("returns used status unchanged", async () => {
    const { getPauseApprovalStatusForRequester } = await import(
      "@/lib/managedProfilePauseApproval"
    );
    const status = await getPauseApprovalStatusForRequester(sessionAuth, "apr_status_test");
    expect(status?.status).toBe("used");
  });
});
