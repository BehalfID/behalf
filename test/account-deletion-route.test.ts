import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteDeveloperUser: vi.fn(),
  consumeAccountDeleteReauthProof: vi.fn(),
  readReauthTokenFromRequest: vi.fn(),
  clearReauthProofCookie: vi.fn(),
  clearDeveloperSessionCookie: vi.fn(),
  recordIdentityAudit: vi.fn(),
  deleteByTokenHash: vi.fn()
}));

vi.mock("@/lib/accountDeletion", () => ({
  deleteDeveloperUser: mocks.deleteDeveloperUser
}));
vi.mock("@/lib/reauth", () => ({
  consumeAccountDeleteReauthProof: mocks.consumeAccountDeleteReauthProof,
  readReauthTokenFromRequest: mocks.readReauthTokenFromRequest,
  clearReauthProofCookie: mocks.clearReauthProofCookie
}));
vi.mock("@/lib/authProviders/identityAudit", () => ({
  recordIdentityAudit: mocks.recordIdentityAudit
}));
vi.mock("@/lib/repositories/sessions", () => ({
  deleteByTokenHash: mocks.deleteByTokenHash
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
    hashSessionToken: actual.hashSessionToken,
    clearDeveloperSessionCookie: mocks.clearDeveloperSessionCookie,
    requireDashboardMutationOrigin: vi.fn(() => null)
  };
});
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));

function deleteRequest(body: Record<string, unknown>, cookieToken?: string) {
  return Object.assign(
    new Request("http://example.test/api/auth/account", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://example.test"
      },
      body: JSON.stringify(body)
    }),
    {
      nextUrl: new URL("http://example.test/api/auth/account"),
      cookies: {
        get: (name: string) => {
          if (name === "behalfid_developer" && cookieToken !== undefined) {
            return { value: cookieToken };
          }
          return undefined;
        }
      }
    }
  ) as never;
}

describe("DELETE /api/auth/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteDeveloperUser.mockResolvedValue({
      ok: true,
      deletedUserId: "user_test",
      deletedAccountIds: []
    });
    mocks.readReauthTokenFromRequest.mockImplementation(
      (_req: unknown, bodyToken?: unknown) =>
        typeof bodyToken === "string" ? bodyToken : null
    );
    mocks.consumeAccountDeleteReauthProof.mockResolvedValue({
      ok: true,
      method: "password",
      proofId: "reauth_1"
    });
  });

  it("requires DELETE confirmation text", async () => {
    const { DELETE } = await import("@/app/api/auth/account/route");
    const res = await DELETE(deleteRequest({ confirmation: "REMOVE", reauthToken: "tok" }));
    expect(res.status).toBe(400);
    expect(mocks.deleteDeveloperUser).not.toHaveBeenCalled();
  });

  it("rejects deletion when recent-auth proof is missing", async () => {
    mocks.consumeAccountDeleteReauthProof.mockResolvedValue({
      ok: false,
      reason: "missing_proof"
    });
    const { DELETE } = await import("@/app/api/auth/account/route");
    const res = await DELETE(deleteRequest({ confirmation: "DELETE" }));
    expect(res.status).toBe(401);
    expect(mocks.deleteDeveloperUser).not.toHaveBeenCalled();
    expect(mocks.recordIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account_deletion_blocked" })
    );
  });

  it("rejects when proof is expired or already consumed", async () => {
    mocks.consumeAccountDeleteReauthProof.mockResolvedValue({
      ok: false,
      reason: "expired"
    });
    const { DELETE } = await import("@/app/api/auth/account/route");
    const res = await DELETE(
      deleteRequest({ confirmation: "DELETE", reauthToken: "stale" })
    );
    expect(res.status).toBe(401);
    expect(mocks.deleteDeveloperUser).not.toHaveBeenCalled();
  });

  it("deletes when confirmation and reauth proof are valid", async () => {
    const { DELETE } = await import("@/app/api/auth/account/route");
    const res = await DELETE(
      deleteRequest({ confirmation: "DELETE", reauthToken: "fresh-proof" }, "session-token")
    );
    expect(res.status).toBe(200);
    expect(mocks.consumeAccountDeleteReauthProof).toHaveBeenCalledWith({
      token: "fresh-proof",
      userId: "user_test"
    });
    expect(mocks.deleteDeveloperUser).toHaveBeenCalledWith("user_test");
    expect(mocks.clearDeveloperSessionCookie).toHaveBeenCalled();
    expect(mocks.clearReauthProofCookie).toHaveBeenCalled();
    expect(mocks.recordIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account_deletion_completed" })
    );
  });

  it("does not accept password alone without a reauth proof", async () => {
    mocks.readReauthTokenFromRequest.mockReturnValue(null);
    mocks.consumeAccountDeleteReauthProof.mockResolvedValue({
      ok: false,
      reason: "missing_proof"
    });
    const { DELETE } = await import("@/app/api/auth/account/route");
    const res = await DELETE(
      deleteRequest({ confirmation: "DELETE", password: "password12345" })
    );
    expect(res.status).toBe(401);
    expect(mocks.deleteDeveloperUser).not.toHaveBeenCalled();
  });
});
