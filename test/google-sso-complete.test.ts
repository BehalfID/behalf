import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  checkRateLimit: vi.fn(),
  checkAuthRateLimit: vi.fn(),
  createDeveloperAccount: vi.fn(),
  createDeveloperSession: vi.fn(),
  setDeveloperSessionCookie: vi.fn(),
  pendingFindOne: vi.fn(),
  pendingDeleteOne: vi.fn(),
  userExists: vi.fn(),
  userCreate: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  checkAuthRateLimit: mocks.checkAuthRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/lib/developerAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/developerAuth")>()),
  requireDashboardMutationOrigin: vi.fn().mockReturnValue(null),
  createDeveloperSession: mocks.createDeveloperSession,
  setDeveloperSessionCookie: mocks.setDeveloperSessionCookie
}));
vi.mock("@/lib/account", () => ({ createDeveloperAccount: mocks.createDeveloperAccount }));
vi.mock("@/models/OAuthPendingSignup", () => ({
  default: {
    findOne: mocks.pendingFindOne,
    deleteOne: mocks.pendingDeleteOne
  }
}));
vi.mock("@/models/DeveloperUser", () => ({
  default: {
    exists: mocks.userExists,
    create: mocks.userCreate
  }
}));

function makeCompleteRequest(body: Record<string, unknown>, cookie?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: "http://localhost:3000"
  };
  if (cookie) headers.cookie = cookie;
  return new NextRequest("http://localhost:3000/api/auth/google/complete", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

describe("POST /api/auth/google/complete", () => {
  beforeEach(() => {
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.checkAuthRateLimit.mockResolvedValue({ limited: false });
    mocks.createDeveloperAccount.mockResolvedValue({ accountId: "acct_1" });
    mocks.createDeveloperSession.mockResolvedValue({ token: "sess_token", session: { sessionId: "sess_1" } });
    mocks.setDeveloperSessionCookie.mockImplementation(() => undefined);
    mocks.pendingDeleteOne.mockResolvedValue({});
    mocks.userExists.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({
      userId: "user_new",
      email: "new@acme.com",
      emailVerified: true
    });
  });

  it("rejects missing date of birth", async () => {
    const { POST } = await import("@/app/api/auth/google/complete/route");
    const res = await POST(makeCompleteRequest({}));
    expect(res.status).toBe(400);
  });

  it("rejects underage date of birth", async () => {
    const { POST } = await import("@/app/api/auth/google/complete/route");
    const recent = new Date();
    recent.setFullYear(recent.getFullYear() - 10);
    const res = await POST(makeCompleteRequest({ dateOfBirth: recent.toISOString().slice(0, 10) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/13/);
  });

  it("creates a Google user after valid DOB when pending cookie is present", async () => {
    const { hashPendingSignupToken } = await import("@/lib/googleOAuth");
    const pendingToken = "pending-token-value";
    mocks.pendingFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          pendingId: "pend_1",
          googleSub: "google-sub-1",
          email: "new@acme.com",
          emailVerified: true,
          firstName: "Ada",
          lastName: "Lovelace",
          tokenHash: hashPendingSignupToken(pendingToken),
          expiresAt: new Date(Date.now() + 60_000)
        })
      })
    });

    const { POST } = await import("@/app/api/auth/google/complete/route");
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 20);
    const res = await POST(
      makeCompleteRequest(
        { dateOfBirth: dob.toISOString().slice(0, 10) },
        `behalfid_google_pending=pend_1.${pendingToken}`
      )
    );
    expect(res.status).toBe(200);
    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@acme.com",
        googleSub: "google-sub-1",
        authProviders: ["google"],
        emailVerified: true
      })
    );
    expect(mocks.createDeveloperAccount).toHaveBeenCalled();
    expect(mocks.createDeveloperSession).toHaveBeenCalled();
    const body = await res.json();
    expect(body.redirectTo).toBe("/onboarding");
  });
});
