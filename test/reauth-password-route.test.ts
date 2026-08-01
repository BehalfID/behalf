import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findByUserId: vi.fn(),
  verifyPassword: vi.fn(),
  issueReauthProof: vi.fn(),
  logAccountDeletionReauthFailed: vi.fn(),
  setReauthProofCookie: vi.fn(),
  checkAuthRateLimit: vi.fn(async () => ({ limited: false }))
}));

vi.mock("@/lib/repositories/users", () => ({
  findByUserId: mocks.findByUserId
}));
vi.mock("@/lib/reauth", () => ({
  ACCOUNT_DELETE_PURPOSE: "account_delete",
  issueReauthProof: mocks.issueReauthProof,
  logAccountDeletionReauthFailed: mocks.logAccountDeletionReauthFailed,
  setReauthProofCookie: mocks.setReauthProofCookie
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
    verifyPassword: mocks.verifyPassword,
    requireDashboardMutationOrigin: vi.fn(() => null)
  };
});
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  checkAuthRateLimit: mocks.checkAuthRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));

function post(body: Record<string, unknown>) {
  return Object.assign(
    new Request("http://example.test/api/auth/reauth/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://example.test"
      },
      body: JSON.stringify(body)
    }),
    { nextUrl: new URL("http://example.test/api/auth/reauth/password") }
  ) as never;
}

describe("POST /api/auth/reauth/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByUserId.mockResolvedValue({ userId: "user_test", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.issueReauthProof.mockResolvedValue({
      token: "proof-token",
      expiresAt: new Date(Date.now() + 60_000),
      proofId: "reauth_1"
    });
    mocks.checkAuthRateLimit.mockResolvedValue({ limited: false });
  });

  it("creates a proof for the correct password", async () => {
    const { POST } = await import("@/app/api/auth/reauth/password/route");
    const res = await POST(post({ password: "correct-horse" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reauthToken).toBe("proof-token");
    expect(mocks.issueReauthProof).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_test",
        purpose: "account_delete",
        method: "password"
      })
    );
    expect(mocks.setReauthProofCookie).toHaveBeenCalled();
  });

  it("rejects the wrong password with a generic error", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const { POST } = await import("@/app/api/auth/reauth/password/route");
    const res = await POST(post({ password: "nope" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Identity confirmation failed/);
    expect(mocks.issueReauthProof).not.toHaveBeenCalled();
  });

  it("handles a null password hash without revealing the difference", async () => {
    mocks.findByUserId.mockResolvedValue({ userId: "user_test", passwordHash: null });
    const { POST } = await import("@/app/api/auth/reauth/password/route");
    const res = await POST(post({ password: "anything" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Identity confirmation failed/);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it("rate limits password reauth attempts", async () => {
    mocks.checkAuthRateLimit.mockResolvedValue({ limited: true });
    const { POST } = await import("@/app/api/auth/reauth/password/route");
    const res = await POST(post({ password: "correct-horse" }));
    expect(res.status).toBe(429);
    expect(mocks.issueReauthProof).not.toHaveBeenCalled();
  });
});
