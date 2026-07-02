import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getDeveloperFromToken: vi.fn(),
  acceptInvite: vi.fn(),
  requireDashboardMutationOrigin: vi.fn()
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitError: () => new Response(null, { status: 429 })
}));

vi.mock("@/lib/developerAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/developerAuth")>();
  return {
    ...actual,
    getDeveloperFromToken: mocks.getDeveloperFromToken,
    requireDashboardMutationOrigin: mocks.requireDashboardMutationOrigin
  };
});

vi.mock("@/lib/inviteAcceptance", () => ({
  acceptInvite: mocks.acceptInvite
}));

function acceptRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/invites/accept", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost"
    },
    body: JSON.stringify(body)
  });
}

describe("POST /api/invites/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.requireDashboardMutationOrigin.mockReturnValue(null);
  });

  it("requires authentication", async () => {
    mocks.getDeveloperFromToken.mockResolvedValue(null);
    const { POST } = await import("@/app/api/invites/accept/route");
    const response = await POST(acceptRequest({ token: "tok_test" }));
    expect(response.status).toBe(401);
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
  });

  it("blocks unverified email users", async () => {
    mocks.getDeveloperFromToken.mockResolvedValue({
      user: { userId: "user_a", email: "invited@example.com", emailVerified: false },
      session: { sessionId: "sess_a" },
      activeAccountId: "acct_primary"
    });
    const { POST } = await import("@/app/api/invites/accept/route");
    const response = await POST(acceptRequest({ token: "tok_test" }));
    expect(response.status).toBe(403);
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
  });

  it("accepts invite for verified authenticated user", async () => {
    mocks.getDeveloperFromToken.mockResolvedValue({
      user: { userId: "user_a", email: "invited@example.com", emailVerified: true },
      session: { sessionId: "sess_a" },
      activeAccountId: "acct_primary"
    });
    mocks.acceptInvite.mockResolvedValue({
      ok: true,
      accountId: "acct_team",
      membershipId: "mbr_team",
      role: "ENGINEER"
    });
    const { POST } = await import("@/app/api/invites/accept/route");
    const response = await POST(acceptRequest({ token: "tok_test" }));
    expect(response.status).toBe(200);
    expect(mocks.acceptInvite).toHaveBeenCalledWith("tok_test", "user_a", "invited@example.com", {
      sessionId: "sess_a"
    });
  });
});
