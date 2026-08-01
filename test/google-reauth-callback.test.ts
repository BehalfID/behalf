import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  parseOAuthStateCookie: vi.fn(),
  exchangeGoogleAuthorizationCode: vi.fn(),
  verifyGoogleIdToken: vi.fn(),
  getDeveloperFromToken: vi.fn(),
  findByUserAndProvider: vi.fn(),
  issueReauthProof: vi.fn(),
  setReauthProofCookie: vi.fn(),
  logAccountDeletionReauthFailed: vi.fn(),
  findByGoogleSub: vi.fn(),
  findByEmail: vi.fn(),
  createDeveloperSession: vi.fn(),
  setDeveloperSessionCookie: vi.fn(),
  resolvePreferredSsoAccountId: vi.fn(),
  switchActiveAccount: vi.fn()
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "limited" }, { status: 429 })
}));
vi.mock("@/lib/googleOAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/googleOAuth")>();
  return {
    ...actual,
    parseOAuthStateCookie: mocks.parseOAuthStateCookie,
    exchangeGoogleAuthorizationCode: mocks.exchangeGoogleAuthorizationCode,
    verifyGoogleIdToken: mocks.verifyGoogleIdToken
  };
});
vi.mock("@/lib/developerAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/developerAuth")>();
  return {
    ...actual,
    getDeveloperFromToken: mocks.getDeveloperFromToken,
    createDeveloperSession: mocks.createDeveloperSession,
    setDeveloperSessionCookie: mocks.setDeveloperSessionCookie
  };
});
vi.mock("@/lib/repositories/externalIdentities", () => ({
  findByUserAndProvider: mocks.findByUserAndProvider
}));
vi.mock("@/lib/repositories/users", () => ({
  findByGoogleSub: mocks.findByGoogleSub,
  findByEmail: mocks.findByEmail
}));
vi.mock("@/lib/reauth", () => ({
  ACCOUNT_DELETE_PURPOSE: "account_delete",
  issueReauthProof: mocks.issueReauthProof,
  setReauthProofCookie: mocks.setReauthProofCookie,
  logAccountDeletionReauthFailed: mocks.logAccountDeletionReauthFailed
}));
vi.mock("@/lib/workspaceSso", () => ({
  resolvePreferredSsoAccountId: mocks.resolvePreferredSsoAccountId
}));
vi.mock("@/lib/accountContext", () => ({
  switchActiveAccount: mocks.switchActiveAccount
}));

function callbackRequest() {
  return new NextRequest(
    "https://auth.behalfid.com/api/auth/google/callback?code=abc&state=signed.state",
    {
      headers: {
        cookie: "behalfid_google_oauth=signed.state; behalfid_developer=sess"
      }
    }
  );
}

describe("Google OAuth reauth for account deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.parseOAuthStateCookie.mockReturnValue({
      n: "nonce",
      v: "verifier",
      m: "reauth",
      next: "/dashboard/settings",
      exp: Date.now() + 60_000,
      uid: "user_1"
    });
    mocks.exchangeGoogleAuthorizationCode.mockResolvedValue({ idToken: "id.jwt" });
    mocks.verifyGoogleIdToken.mockResolvedValue({
      sub: "google-sub-1",
      email: "g@example.com",
      email_verified: true
    });
    mocks.getDeveloperFromToken.mockResolvedValue({
      user: { userId: "user_1", googleSub: "google-sub-1", email: "g@example.com" },
      session: { sessionId: "sess_1" }
    });
    mocks.findByUserAndProvider.mockResolvedValue(null);
    mocks.issueReauthProof.mockResolvedValue({
      token: "reauth-token",
      expiresAt: new Date(Date.now() + 60_000),
      proofId: "reauth_1"
    });
  });

  it("issues a deletion proof when the Google subject matches", async () => {
    const { GET } = await import("@/app/api/auth/google/callback/route");
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
        method: "google"
      })
    );
    expect(mocks.setReauthProofCookie).toHaveBeenCalled();
    expect(mocks.findByGoogleSub).not.toHaveBeenCalled();
    expect(mocks.createDeveloperSession).not.toHaveBeenCalled();
  });

  it("rejects a different Google account", async () => {
    mocks.verifyGoogleIdToken.mockResolvedValue({
      sub: "google-sub-other",
      email: "other@example.com",
      email_verified: true
    });
    const { GET } = await import("@/app/api/auth/google/callback/route");
    const res = await GET(callbackRequest());
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/dashboard/settings");
    expect(mocks.issueReauthProof).not.toHaveBeenCalled();
    expect(mocks.logAccountDeletionReauthFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "provider_account_mismatch" })
    );
  });

  it("rejects missing state", async () => {
    mocks.parseOAuthStateCookie.mockReturnValue(null);
    const { GET } = await import("@/app/api/auth/google/callback/route");
    const res = await GET(callbackRequest());
    expect(mocks.issueReauthProof).not.toHaveBeenCalled();
    expect(res.status).toBeGreaterThanOrEqual(300);
  });

  it("enforces session/purpose binding via uid", async () => {
    mocks.getDeveloperFromToken.mockResolvedValue({
      user: { userId: "user_other", googleSub: "google-sub-1" },
      session: { sessionId: "sess_x" }
    });
    const { GET } = await import("@/app/api/auth/google/callback/route");
    const res = await GET(callbackRequest());
    expect(mocks.issueReauthProof).not.toHaveBeenCalled();
    expect(mocks.logAccountDeletionReauthFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "session_required" })
    );
    expect(res.headers.get("location") ?? "").toContain("/dashboard/settings");
  });
});
