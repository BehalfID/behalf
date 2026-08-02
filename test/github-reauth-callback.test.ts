import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getLoginProvider: vi.fn(),
  consumeOAuthStateDetailed: vi.fn(),
  getDeveloperFromToken: vi.fn(),
  findByUserAndProvider: vi.fn(),
  issueReauthProof: vi.fn(),
  setReauthProofCookie: vi.fn(),
  logAccountDeletionReauthFailed: vi.fn(),
  resolveProviderLogin: vi.fn(),
  linkIdentity: vi.fn(),
  touchIdentityLogin: vi.fn(),
  createPendingSignup: vi.fn(),
  findByUserId: vi.fn(),
  recordIdentityAudit: vi.fn(),
  createDeveloperSession: vi.fn(),
  setDeveloperSessionCookie: vi.fn(),
  resolvePreferredSsoAccountId: vi.fn(),
  switchActiveAccount: vi.fn(),
  createMfaChallengeToken: vi.fn(),
  updateAccountLastSignIn: vi.fn(),
  exchangeCodeForIdentity: vi.fn()
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
vi.mock("@/lib/repositories/externalIdentities", () => ({
  findByUserAndProvider: mocks.findByUserAndProvider
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
vi.mock("@/lib/reauth", () => ({
  ACCOUNT_DELETE_PURPOSE: "account_delete",
  issueReauthProof: mocks.issueReauthProof,
  setReauthProofCookie: mocks.setReauthProofCookie,
  logAccountDeletionReauthFailed: mocks.logAccountDeletionReauthFailed
}));

function callbackRequest(cookie = "behalfid_oauth_state=state; behalfid_developer=sess") {
  return new NextRequest("https://auth.behalfid.com/api/auth/github/callback?code=abc&state=state", {
    headers: { cookie }
  });
}

describe("GitHub OAuth reauth for account deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.exchangeCodeForIdentity.mockResolvedValue({
      identity: {
        provider: "github",
        providerAccountId: "gh_linked",
        email: "gh@example.com",
        emailVerified: true,
        username: "ghuser",
        firstName: null,
        lastName: null
      }
    });
    mocks.getLoginProvider.mockReturnValue({
      isConfigured: () => ({ configured: true }),
      exchangeCodeForIdentity: mocks.exchangeCodeForIdentity
    });
    mocks.consumeOAuthStateDetailed.mockResolvedValue({
      ok: true,
      state: {
        mode: "reauth",
        codeVerifier: "v",
        next: "/dashboard/settings",
        userId: "user_1",
        stateId: "oas_1",
        provider: "github"
      }
    });
    mocks.getDeveloperFromToken.mockResolvedValue({
      user: { userId: "user_1", email: "gh@example.com" },
      session: { sessionId: "sess_1" }
    });
    mocks.findByUserAndProvider.mockResolvedValue({
      provider: "github",
      providerAccountId: "gh_linked"
    });
    mocks.issueReauthProof.mockResolvedValue({
      token: "reauth-token",
      expiresAt: new Date(Date.now() + 60_000),
      proofId: "reauth_1"
    });
    mocks.resolvePreferredSsoAccountId.mockResolvedValue(null);
  });

  it("issues a deletion proof when the linked GitHub identity matches", async () => {
    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackRequest());
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("reauth=ok");
    expect(location).toContain("#danger-zone");
    expect(mocks.issueReauthProof).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        purpose: "account_delete",
        method: "github"
      })
    );
    expect(mocks.setReauthProofCookie).toHaveBeenCalled();
    expect(mocks.resolveProviderLogin).not.toHaveBeenCalled();
    expect(mocks.linkIdentity).not.toHaveBeenCalled();
    expect(mocks.createDeveloperSession).not.toHaveBeenCalled();
  });

  it("rejects a different GitHub account", async () => {
    mocks.findByUserAndProvider.mockResolvedValue({
      provider: "github",
      providerAccountId: "gh_other"
    });
    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackRequest());
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("oauth_error=provider_error");
    expect(mocks.issueReauthProof).not.toHaveBeenCalled();
    expect(mocks.logAccountDeletionReauthFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "provider_account_mismatch" })
    );
  });

  it("rejects missing/invalid state before issuing a proof", async () => {
    mocks.consumeOAuthStateDetailed.mockResolvedValue({
      ok: false,
      reason: "state_not_found",
      diagnostics: {
        statePresent: true,
        cookiePresent: true,
        databaseRowFound: false,
        expired: false,
        consumed: false
      }
    });
    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackRequest());
    expect(res.headers.get("location") ?? "").toContain("oauth_error=invalid_state");
    expect(mocks.issueReauthProof).not.toHaveBeenCalled();
  });

  it("rejects replayed callbacks via single-use state consume", async () => {
    mocks.consumeOAuthStateDetailed.mockResolvedValue({
      ok: false,
      reason: "state_already_consumed",
      diagnostics: {
        statePresent: true,
        cookiePresent: true,
        databaseRowFound: true,
        expired: false,
        consumed: true
      }
    });
    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackRequest());
    expect(res.headers.get("location") ?? "").toContain("oauth_error=invalid_state");
    expect(mocks.exchangeCodeForIdentity).not.toHaveBeenCalled();
  });

  it("enforces session binding to the state userId", async () => {
    mocks.getDeveloperFromToken.mockResolvedValue({
      user: { userId: "user_other", email: "x@example.com" },
      session: { sessionId: "sess_x" }
    });
    const { GET } = await import("@/app/api/auth/github/callback/route");
    const res = await GET(callbackRequest());
    expect(res.headers.get("location") ?? "").toContain("oauth_error=session_required");
    expect(mocks.issueReauthProof).not.toHaveBeenCalled();
  });

  it("does not create or link accounts during reauth", async () => {
    const { GET } = await import("@/app/api/auth/github/callback/route");
    await GET(callbackRequest());
    expect(mocks.linkIdentity).not.toHaveBeenCalled();
    expect(mocks.resolveProviderLogin).not.toHaveBeenCalled();
    expect(mocks.createPendingSignup).not.toHaveBeenCalled();
  });
});
