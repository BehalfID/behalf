import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAccountById: vi.fn(),
  listByUserId: vi.fn(),
  listIdentityAuditLogs: vi.fn(),
  findMembershipsByUserId: vi.fn(),
  listPasskeysByUserId: vi.fn()
}));

vi.mock("@/lib/repositories/accounts", () => ({
  findAccountById: mocks.findAccountById
}));
vi.mock("@/lib/repositories/externalIdentities", () => ({
  listByUserId: mocks.listByUserId
}));
vi.mock("@/lib/repositories/identityAudit", () => ({
  listIdentityAuditLogs: mocks.listIdentityAuditLogs
}));
vi.mock("@/lib/repositories/memberships", () => ({
  findMembershipsByUserId: mocks.findMembershipsByUserId
}));
vi.mock("@/lib/repositories/passkeys", () => ({
  listPasskeysByUserId: mocks.listPasskeysByUserId
}));
vi.mock("@/lib/developerAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/developerAuth")>();
  return {
    ...actual,
    requireVerifiedDeveloperApi: vi.fn(async () => ({
      user: {
        userId: "user_test",
        email: "dev@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        emailVerified: true,
        mfaEnabledAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      },
      account: null,
      activeAccountId: null,
      session: { sessionId: "sess_1" },
      workspaceSlug: null,
      error: null
    }))
  };
});
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));

function exportRequest() {
  return new Request("http://example.test/api/auth/account/export", {
    method: "GET"
  }) as never;
}

describe("GET /api/auth/account/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMembershipsByUserId.mockResolvedValue([
      { accountId: "acct_1", role: "owner", createdAt: new Date("2026-01-02T00:00:00.000Z") }
    ]);
    mocks.findAccountById.mockResolvedValue({
      accountId: "acct_1",
      name: "Acme",
      slug: "acme",
      companyName: "Acme Inc",
      website: "https://acme.test"
    });
    mocks.listByUserId.mockResolvedValue([
      {
        provider: "google",
        providerUsername: null,
        providerEmail: "dev@example.com",
        linkedAt: new Date("2026-01-01T00:00:00.000Z"),
        lastLoginAt: new Date("2026-01-05T00:00:00.000Z")
      }
    ]);
    mocks.listPasskeysByUserId.mockResolvedValue([
      {
        nickname: "YubiKey",
        deviceType: "cross-platform",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        lastUsedAt: null
      }
    ]);
    mocks.listIdentityAuditLogs.mockResolvedValue([
      {
        action: "password_login",
        provider: "password",
        providerUsername: null,
        context: null,
        createdAt: new Date("2026-01-06T00:00:00.000Z")
      }
    ]);
  });

  it("returns the account owner's own data as a downloadable JSON export", async () => {
    const { GET } = await import("@/app/api/auth/account/export/route");
    const res = await GET(exportRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain("user_test");

    const body = await res.json();
    expect(body.account).toEqual(
      expect.objectContaining({ userId: "user_test", email: "dev@example.com", firstName: "Ada" })
    );
    expect(body.workspaces).toEqual([
      expect.objectContaining({ accountId: "acct_1", role: "owner", workspaceName: "Acme" })
    ]);
    expect(body.linkedIdentities).toHaveLength(1);
    expect(body.passkeys).toEqual([
      expect.objectContaining({ nickname: "YubiKey" })
    ]);
    expect(body.identityAuditHistory).toHaveLength(1);
  });

  it("never includes password hashes or MFA secrets in the export", async () => {
    const { GET } = await import("@/app/api/auth/account/export/route");
    const res = await GET(exportRequest());
    const text = await res.text();

    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("mfaTotpSecretEnc");
    expect(text).not.toContain("mfaBackupCodeHashes");
    expect(text).not.toContain("publicKey");
  });
});
