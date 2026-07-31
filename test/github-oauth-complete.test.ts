import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  checkRateLimit: vi.fn(),
  checkAuthRateLimit: vi.fn(),
  createDeveloperAccount: vi.fn(),
  createDeveloperSession: vi.fn(),
  setDeveloperSessionCookie: vi.fn(),
  findByPendingId: vi.fn(),
  deleteByPendingId: vi.fn(),
  existsByEmail: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  existsByProviderAccount: vi.fn(),
  createExternalIdentity: vi.fn(),
  recordIdentityAudit: vi.fn()
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
vi.mock("@/lib/authProviders/identityAudit", () => ({
  recordIdentityAudit: mocks.recordIdentityAudit
}));
vi.mock("@/lib/repositories/oauthPending", () => ({
  findByPendingId: mocks.findByPendingId,
  deleteByPendingId: mocks.deleteByPendingId
}));
vi.mock("@/lib/repositories/users", () => ({
  existsByEmail: mocks.existsByEmail,
  createUser: mocks.createUser,
  deleteUser: mocks.deleteUser
}));
vi.mock("@/lib/repositories/externalIdentities", () => ({
  existsByProviderAccount: mocks.existsByProviderAccount,
  createExternalIdentity: mocks.createExternalIdentity
}));

function makeCompleteRequest(body: Record<string, unknown>, cookie?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: "http://localhost:3000"
  };
  if (cookie) headers.cookie = cookie;
  return new NextRequest("http://localhost:3000/api/auth/github/complete", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

describe("POST /api/auth/github/complete", () => {
  beforeEach(() => {
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.checkAuthRateLimit.mockResolvedValue({ limited: false });
    mocks.createDeveloperAccount.mockResolvedValue({ accountId: "acct_1" });
    mocks.createDeveloperSession.mockResolvedValue({
      token: "sess_token",
      session: { sessionId: "sess_1" }
    });
    mocks.setDeveloperSessionCookie.mockImplementation(() => undefined);
    mocks.deleteByPendingId.mockResolvedValue({});
    mocks.existsByEmail.mockResolvedValue(false);
    mocks.existsByProviderAccount.mockResolvedValue(false);
    mocks.createUser.mockResolvedValue({
      userId: "user_new",
      email: "new@example.com",
      emailVerified: true
    });
    mocks.createExternalIdentity.mockResolvedValue({});
    mocks.recordIdentityAudit.mockResolvedValue(undefined);
  });

  it("rejects missing date of birth", async () => {
    const { POST } = await import("@/app/api/auth/github/complete/route");
    const res = await POST(makeCompleteRequest({}));
    expect(res.status).toBe(400);
  });

  it("creates a GitHub user after valid DOB when pending cookie is present", async () => {
    const { hashEmailToken } = await import("@/lib/developerAuth");
    const pendingToken = "pending-token-value";
    mocks.findByPendingId.mockResolvedValue({
      pendingId: "pend_1",
      provider: "github",
      providerAccountId: "12345",
      email: "new@example.com",
      emailVerified: true,
      firstName: "Ada",
      lastName: "Lovelace",
      tokenHash: hashEmailToken(pendingToken),
      expiresAt: new Date(Date.now() + 60_000)
    });

    const { POST } = await import("@/app/api/auth/github/complete/route");
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 20);
    const res = await POST(
      makeCompleteRequest(
        { dateOfBirth: dob.toISOString().slice(0, 10) },
        `behalfid_oauth_pending=pend_1.${pendingToken}`
      )
    );
    expect(res.status).toBe(200);
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        authProviders: ["github"],
        emailVerified: true
      })
    );
    expect(mocks.createExternalIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        providerAccountId: "12345"
      })
    );
    expect(mocks.createDeveloperAccount).toHaveBeenCalled();
    expect(mocks.recordIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "identity_registered", provider: "github" })
    );
    const body = await res.json();
    expect(body.redirectTo).toBe("/onboarding");
  });
});
