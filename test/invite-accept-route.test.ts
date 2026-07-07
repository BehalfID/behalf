import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getCurrentDeveloperContext: vi.fn(),
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
    getCurrentDeveloperContext: mocks.getCurrentDeveloperContext,
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
    mocks.getCurrentDeveloperContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/invites/accept/route");
    const response = await POST(acceptRequest({ token: "tok_test" }));
    expect(response.status).toBe(401);
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
  });

  it("blocks unverified email users", async () => {
    mocks.getCurrentDeveloperContext.mockResolvedValue({
      user: { userId: "user_a", email: "invited@example.com", emailVerified: false },
      session: { sessionId: "sess_a" },
      activeAccountId: "acct_primary"
    });
    const { POST } = await import("@/app/api/invites/accept/route");
    const response = await POST(acceptRequest({ token: "tok_test" }));
    expect(response.status).toBe(403);
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
  });

  it("returns a structured 402 when the workspace seat limit is reached", async () => {
    mocks.getCurrentDeveloperContext.mockResolvedValue({
      user: { userId: "user_a", email: "invited@example.com", emailVerified: true },
      session: { sessionId: "sess_a" },
      activeAccountId: "acct_primary"
    });
    mocks.acceptInvite.mockResolvedValue({
      error: "seat_limit_reached",
      quota: {
        allowed: false,
        code: "SEAT_LIMIT_REACHED",
        plan: "free",
        limit: 1,
        reason: "Billable seat limit of 1 reached on the free plan.",
        upgradeHint: "Upgrade to Pro to add more billable seats."
      }
    });
    const { POST } = await import("@/app/api/invites/accept/route");
    const response = await POST(acceptRequest({ token: "tok_test" }));
    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: "Billable seat limit of 1 reached on the free plan.",
      code: "SEAT_LIMIT_REACHED",
      currentPlan: "free",
      limit: 1
    }));
  });

  it("accepts invite for verified authenticated user", async () => {
    mocks.getCurrentDeveloperContext.mockResolvedValue({
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
