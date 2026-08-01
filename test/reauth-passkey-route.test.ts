import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  beginPasskeyAuthentication: vi.fn(),
  finishPasskeyAuthentication: vi.fn(),
  issueReauthProof: vi.fn(),
  setReauthProofCookie: vi.fn(),
  logAccountDeletionReauthFailed: vi.fn(),
  recordIdentityAudit: vi.fn()
}));

vi.mock("@/lib/authProviders/passkeyService", () => ({
  beginPasskeyAuthentication: mocks.beginPasskeyAuthentication,
  finishPasskeyAuthentication: mocks.finishPasskeyAuthentication
}));
vi.mock("@/lib/reauth", () => ({
  ACCOUNT_DELETE_PURPOSE: "account_delete",
  issueReauthProof: mocks.issueReauthProof,
  setReauthProofCookie: mocks.setReauthProofCookie,
  logAccountDeletionReauthFailed: mocks.logAccountDeletionReauthFailed
}));
vi.mock("@/lib/authProviders/identityAudit", () => ({
  recordIdentityAudit: mocks.recordIdentityAudit
}));
vi.mock("@/lib/developerAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/developerAuth")>();
  return {
    ...actual,
    requireVerifiedDeveloperApi: vi.fn(async () => ({
      user: { userId: "user_test", email: "dev@example.com", emailVerified: true },
      account: null,
      activeAccountId: null,
      session: { sessionId: "sess_1" },
      workspaceSlug: null,
      error: null
    })),
    requireDashboardMutationOrigin: vi.fn(() => null)
  };
});
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));

function post(path: string, body: Record<string, unknown>) {
  return Object.assign(
    new Request(`http://example.test${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://example.test"
      },
      body: JSON.stringify(body)
    }),
    { nextUrl: new URL(`http://example.test${path}`) }
  ) as never;
}

describe("passkey reauth for account deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.beginPasskeyAuthentication.mockResolvedValue({
      ok: true,
      options: { challenge: "c" },
      challengeId: "chal_1"
    });
    mocks.finishPasskeyAuthentication.mockResolvedValue({
      ok: true,
      userId: "user_test",
      credentialRecordId: "cred_1"
    });
    mocks.issueReauthProof.mockResolvedValue({
      token: "proof",
      expiresAt: new Date(Date.now() + 60_000),
      proofId: "reauth_1"
    });
  });

  it("starts a user-bound authentication challenge", async () => {
    const { POST } = await import("@/app/api/auth/reauth/passkey/options/route");
    const res = await POST(post("/api/auth/reauth/passkey/options", {}));
    expect(res.status).toBe(200);
    expect(mocks.beginPasskeyAuthentication).toHaveBeenCalledWith({ userId: "user_test" });
    expect(mocks.recordIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account_deletion_reauth_started" })
    );
  });

  it("issues a proof after a valid registered credential assertion", async () => {
    const { POST } = await import("@/app/api/auth/reauth/passkey/verify/route");
    const res = await POST(
      post("/api/auth/reauth/passkey/verify", {
        response: { id: "cred", response: {}, type: "public-key", clientExtensionResults: {} }
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reauthToken).toBe("proof");
    expect(mocks.issueReauthProof).toHaveBeenCalledWith(
      expect.objectContaining({ method: "passkey", purpose: "account_delete" })
    );
  });

  it("rejects a credential belonging to another user", async () => {
    mocks.finishPasskeyAuthentication.mockResolvedValue({
      ok: true,
      userId: "user_other",
      credentialRecordId: "cred_x"
    });
    const { POST } = await import("@/app/api/auth/reauth/passkey/verify/route");
    const res = await POST(
      post("/api/auth/reauth/passkey/verify", {
        response: { id: "cred", response: {}, type: "public-key", clientExtensionResults: {} }
      })
    );
    expect(res.status).toBe(401);
    expect(mocks.issueReauthProof).not.toHaveBeenCalled();
    expect(mocks.logAccountDeletionReauthFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "credential_user_mismatch" })
    );
  });

  it("rejects expired or reused challenges via the passkey service", async () => {
    mocks.finishPasskeyAuthentication.mockResolvedValue({
      ok: false,
      code: "invalid_challenge"
    });
    const { POST } = await import("@/app/api/auth/reauth/passkey/verify/route");
    const res = await POST(
      post("/api/auth/reauth/passkey/verify", {
        response: { id: "cred", response: {}, type: "public-key", clientExtensionResults: {} }
      })
    );
    expect(res.status).toBe(401);
    expect(mocks.issueReauthProof).not.toHaveBeenCalled();
  });
});
