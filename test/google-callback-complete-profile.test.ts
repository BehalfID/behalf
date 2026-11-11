import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  exchangeGoogleAuthorizationCode: vi.fn(),
  verifyGoogleIdToken: vi.fn(),
  parseOAuthStateCookie: vi.fn(),
  findByGoogleSub: vi.fn(),
  findByEmail: vi.fn(),
  createPendingSignup: vi.fn(),
  createDeveloperSession: vi.fn(),
  setDeveloperSessionCookie: vi.fn(),
  updateAccountLastSignIn: vi.fn(),
  recordIdentityAudit: vi.fn(),
  touchLoginMetadata: vi.fn(),
  resolvePreferredSsoAccountId: vi.fn(),
  switchActiveAccount: vi.fn(),
  updateUser: vi.fn(),
  createMfaChallengeToken: vi.fn()
}));

vi.mock("@/lib/mfa", () => ({
  createMfaChallengeToken: mocks.createMfaChallengeToken
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));

vi.mock("@/lib/googleOAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/googleOAuth")>();
  return {
    ...actual,
    exchangeGoogleAuthorizationCode: mocks.exchangeGoogleAuthorizationCode,
    verifyGoogleIdToken: mocks.verifyGoogleIdToken,
    parseOAuthStateCookie: mocks.parseOAuthStateCookie
  };
});

vi.mock("@/lib/repositories/users", () => ({
  findByGoogleSub: mocks.findByGoogleSub,
  findByEmail: mocks.findByEmail,
  updateUser: mocks.updateUser
}));

vi.mock("@/lib/repositories/oauthPending", () => ({
  createPendingSignup: mocks.createPendingSignup
}));

vi.mock("@/lib/repositories/externalIdentities", () => ({
  touchLoginMetadata: mocks.touchLoginMetadata
}));

vi.mock("@/lib/developerAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/developerAuth")>();
  return {
    ...actual,
    createDeveloperSession: mocks.createDeveloperSession,
    setDeveloperSessionCookie: mocks.setDeveloperSessionCookie
  };
});

vi.mock("@/lib/authProviders/authUsage", () => ({
  updateAccountLastSignIn: mocks.updateAccountLastSignIn
}));

vi.mock("@/lib/authProviders/identityAudit", () => ({
  recordIdentityAudit: mocks.recordIdentityAudit
}));

vi.mock("@/lib/workspaceSso", () => ({
  resolvePreferredSsoAccountId: mocks.resolvePreferredSsoAccountId
}));

vi.mock("@/lib/accountContext", () => ({
  switchActiveAccount: mocks.switchActiveAccount
}));

function callbackRequest(origin = "https://auth.behalfid.com") {
  return new NextRequest(
    `${origin}/api/auth/google/callback?code=abc&state=state.cookie`,
    { headers: { cookie: "behalfid_google_oauth=state.cookie" } }
  );
}

describe("Google callback complete-profile routing", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.parseOAuthStateCookie.mockReturnValue({
      v: "verifier",
      next: "/dashboard"
    });
    mocks.exchangeGoogleAuthorizationCode.mockResolvedValue({ idToken: "id-token" });
    mocks.verifyGoogleIdToken.mockResolvedValue({
      sub: "google-sub-new",
      email: "newbie@example.com",
      email_verified: true,
      given_name: "New",
      family_name: "User"
    });
    mocks.findByGoogleSub.mockResolvedValue(null);
    mocks.findByEmail.mockResolvedValue(null);
    mocks.createPendingSignup.mockResolvedValue({ pendingId: "pend_1" });
    mocks.resolvePreferredSsoAccountId.mockResolvedValue(null);
  });

  it("redirects new Google users to /complete-profile with next + pending cookie", async () => {
    const { GET } = await import("@/app/api/auth/google/callback/route");
    const res = await GET(callbackRequest());
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/complete-profile");
    expect(location).not.toContain("/auth/complete-profile");
    expect(location).not.toContain("/auth/auth/");
    expect(location).toContain("next=%2Fdashboard");
    const setCookie = res.headers.getSetCookie?.() ?? [];
    expect(setCookie.some((c) => c.startsWith("behalfid_google_pending="))).toBe(true);
    expect(mocks.createPendingSignup).toHaveBeenCalled();
  });

  it("keeps apex/local redirects relative for complete-profile", async () => {
    const { GET } = await import("@/app/api/auth/google/callback/route");
    const res = await GET(callbackRequest("http://localhost:3000"));
    const location = res.headers.get("location") ?? "";
    expect(location).toBe("http://localhost:3000/complete-profile?next=%2Fdashboard");
  });

  it("sends existing Google users to the dashboard, not profile completion", async () => {
    mocks.findByGoogleSub.mockResolvedValue({
      userId: "user_1",
      email: "old@example.com",
      emailVerified: true,
      onboardingCompletedAt: new Date(),
      authProviders: ["google"]
    });
    mocks.createDeveloperSession.mockResolvedValue({
      token: "sess",
      session: { sessionId: "sess_1" }
    });
    mocks.updateAccountLastSignIn.mockResolvedValue(undefined);
    mocks.recordIdentityAudit.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/auth/google/callback/route");
    const res = await GET(callbackRequest());
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/dashboard");
    expect(location).not.toContain("complete-profile");
    expect(mocks.createPendingSignup).not.toHaveBeenCalled();
  });

  it("requires the TOTP second factor for MFA-enabled users instead of issuing a session", async () => {
    mocks.createDeveloperSession.mockClear();
    mocks.setDeveloperSessionCookie.mockClear();
    mocks.findByGoogleSub.mockResolvedValue({
      userId: "user_mfa",
      email: "mfa@example.com",
      emailVerified: true,
      onboardingCompletedAt: new Date(),
      authProviders: ["google"],
      mfaEnabledAt: new Date("2026-01-01T00:00:00.000Z")
    });
    mocks.updateAccountLastSignIn.mockResolvedValue(undefined);
    mocks.recordIdentityAudit.mockResolvedValue(undefined);
    mocks.touchLoginMetadata.mockResolvedValue(undefined);
    mocks.createMfaChallengeToken.mockResolvedValue("mfa-challenge-token");

    const { GET } = await import("@/app/api/auth/google/callback/route");
    const res = await GET(callbackRequest());

    expect(res.headers.get("location") ?? "").toContain("/login?oauth_mfa=1");
    expect(mocks.createMfaChallengeToken).toHaveBeenCalledWith("user_mfa");
    expect(mocks.createDeveloperSession).not.toHaveBeenCalled();
    expect(mocks.setDeveloperSessionCookie).not.toHaveBeenCalled();
    const setCookie = res.headers.getSetCookie?.() ?? [];
    expect(setCookie.some((c) => c.startsWith("behalfid_oauth_mfa=mfa-challenge-token"))).toBe(true);
    expect(setCookie.some((c) => c.startsWith("behalfid_session"))).toBe(false);
  });

  it("does not overwrite an existing, different Google link when matching by email", async () => {
    mocks.updateUser.mockClear();
    mocks.createDeveloperSession.mockClear();
    mocks.findByGoogleSub.mockResolvedValue(null);
    mocks.findByEmail.mockResolvedValue({
      userId: "user_linked",
      email: "newbie@example.com",
      emailVerified: true,
      googleSub: "google-sub-original",
      authProviders: ["google"]
    });

    const { GET } = await import("@/app/api/auth/google/callback/route");
    const res = await GET(callbackRequest());

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.createDeveloperSession).not.toHaveBeenCalled();
    expect(res.headers.get("location") ?? "").not.toContain("/dashboard");
  });
});
