import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getLoginProvider: vi.fn(),
  consumeOAuthStateDetailed: vi.fn(),
  resolveProviderLogin: vi.fn(),
  createPendingSignup: vi.fn(),
  findByUserId: vi.fn(),
  touchIdentityLogin: vi.fn(),
  recordIdentityAudit: vi.fn(),
  updateAccountLastSignIn: vi.fn(),
  createDeveloperSession: vi.fn(),
  setDeveloperSessionCookie: vi.fn(),
  resolvePreferredSsoAccountId: vi.fn(),
  switchActiveAccount: vi.fn(),
  createMfaChallengeToken: vi.fn(),
  getDeveloperFromToken: vi.fn(),
  linkIdentity: vi.fn()
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "limited" }, { status: 429 })
}));

vi.mock("@/lib/authProviders/providers/registry", () => ({
  getLoginProvider: mocks.getLoginProvider
}));

vi.mock("@/lib/authProviders/oauthState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authProviders/oauthState")>();
  return {
    ...actual,
    consumeOAuthStateDetailed: mocks.consumeOAuthStateDetailed,
    logOAuthStateFailure: vi.fn()
  };
});

vi.mock("@/lib/authProviders/externalIdentityService", () => ({
  resolveProviderLogin: mocks.resolveProviderLogin,
  linkIdentity: mocks.linkIdentity,
  touchIdentityLogin: mocks.touchIdentityLogin
}));

vi.mock("@/lib/repositories/oauthPending", () => ({
  createPendingSignup: mocks.createPendingSignup
}));

vi.mock("@/lib/repositories/users", () => ({
  findByUserId: mocks.findByUserId
}));

vi.mock("@/lib/authProviders/identityAudit", () => ({
  recordIdentityAudit: mocks.recordIdentityAudit
}));

vi.mock("@/lib/authProviders/authUsage", () => ({
  updateAccountLastSignIn: mocks.updateAccountLastSignIn
}));

vi.mock("@/lib/developerAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/developerAuth")>();
  return {
    ...actual,
    createDeveloperSession: mocks.createDeveloperSession,
    setDeveloperSessionCookie: mocks.setDeveloperSessionCookie,
    getDeveloperFromToken: mocks.getDeveloperFromToken
  };
});

vi.mock("@/lib/workspaceSso", () => ({
  resolvePreferredSsoAccountId: mocks.resolvePreferredSsoAccountId
}));

vi.mock("@/lib/accountContext", () => ({
  switchActiveAccount: mocks.switchActiveAccount
}));

vi.mock("@/lib/mfa", () => ({
  createMfaChallengeToken: mocks.createMfaChallengeToken
}));

function callbackRequest(origin = "https://auth.behalfid.com") {
  return new NextRequest(`${origin}/api/auth/github/callback?code=abc&state=state`, {
    headers: { cookie: "behalfid_oauth_state=state" }
  });
}

describe("GitHub callback complete-profile routing", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.getLoginProvider.mockReturnValue({
      isConfigured: () => ({ configured: true }),
      exchangeCodeForIdentity: vi.fn().mockResolvedValue({
        identity: {
          provider: "github",
          providerAccountId: "gh_1",
          email: "gh@example.com",
          emailVerified: true,
          username: "ghuser",
          firstName: null,
          lastName: null
        }
      })
    });
    mocks.consumeOAuthStateDetailed.mockResolvedValue({
      ok: true,
      state: {
        mode: "login",
        codeVerifier: "v",
        next: "/dashboard",
        userId: null,
        stateId: "oas_1",
        provider: "github"
      }
    });
    mocks.createPendingSignup.mockResolvedValue({ pendingId: "pend_gh" });
    mocks.resolvePreferredSsoAccountId.mockResolvedValue(null);
  });

  it("redirects new GitHub users to /complete-profile with provider + pending cookie", async () => {
    mocks.resolveProviderLogin.mockResolvedValue({
      kind: "new_account",
      email: "gh@example.com"
    });

    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackRequest());
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/complete-profile");
    expect(location).toContain("provider=github");
    expect(location).toContain("next=%2Fdashboard");
    expect(location).not.toContain("/auth/complete-profile");
    const setCookie = res.headers.getSetCookie?.() ?? [];
    expect(setCookie.some((c) => c.startsWith("behalfid_oauth_pending="))).toBe(true);
  });

  it("sends existing GitHub users to the dashboard, not profile completion", async () => {
    mocks.resolveProviderLogin.mockResolvedValue({
      kind: "existing_identity",
      userId: "user_gh"
    });
    mocks.findByUserId.mockResolvedValue({
      userId: "user_gh",
      email: "gh@example.com",
      emailVerified: true,
      onboardingCompletedAt: new Date()
    });
    mocks.touchIdentityLogin.mockResolvedValue(undefined);
    mocks.recordIdentityAudit.mockResolvedValue(undefined);
    mocks.updateAccountLastSignIn.mockResolvedValue(undefined);
    mocks.createDeveloperSession.mockResolvedValue({
      token: "sess",
      session: { sessionId: "sess_1" }
    });

    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackRequest());
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/dashboard");
    expect(location).not.toContain("complete-profile");
    expect(mocks.createPendingSignup).not.toHaveBeenCalled();
  });
});
