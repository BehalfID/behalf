import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPostgresDb: vi.fn(() => ({})),
  createReauthProof: vi.fn(),
  consumeReauthProof: vi.fn(),
  findReauthProofByHash: vi.fn(),
  recordIdentityAudit: vi.fn(),
  findByUserId: vi.fn(),
  getUsableLoginMethods: vi.fn(),
  listByUserId: vi.fn(),
  isGitHubOAuthConfigured: vi.fn(() => true),
  isGoogleOAuthConfigured: vi.fn(() => true),
  isWebAuthnConfigured: vi.fn(() => true)
}));

vi.mock("@/lib/db/postgres", () => ({ getPostgresDb: mocks.getPostgresDb }));
vi.mock("@/lib/repositories/postgres/reauthProofs", () => ({
  createReauthProof: mocks.createReauthProof,
  consumeReauthProof: mocks.consumeReauthProof,
  findReauthProofByHash: mocks.findReauthProofByHash
}));
vi.mock("@/lib/authProviders/identityAudit", () => ({
  recordIdentityAudit: mocks.recordIdentityAudit
}));
vi.mock("@/lib/repositories/users", () => ({
  findByUserId: mocks.findByUserId
}));
vi.mock("@/lib/repositories/externalIdentities", () => ({
  listByUserId: mocks.listByUserId
}));
vi.mock("@/lib/authProviders/loginMethodSafety", () => ({
  getUsableLoginMethods: mocks.getUsableLoginMethods
}));
vi.mock("@/lib/authProviders/providers/github", () => ({
  isGitHubOAuthConfigured: mocks.isGitHubOAuthConfigured
}));
vi.mock("@/lib/googleOAuth", () => ({
  isGoogleOAuthConfigured: mocks.isGoogleOAuthConfigured
}));
vi.mock("@/lib/authProviders/webauthnConfig", () => ({
  isWebAuthnConfigured: mocks.isWebAuthnConfigured
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import {
  ACCOUNT_DELETE_PURPOSE,
  consumeAccountDeleteReauthProof,
  issueReauthProof,
  listAccountDeleteReauthMethods
} from "@/lib/reauth";

describe("listAccountDeleteReauthMethods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByUserId.mockResolvedValue({ userId: "u1", googleSub: undefined });
    mocks.listByUserId.mockResolvedValue([]);
    mocks.getUsableLoginMethods.mockResolvedValue({
      hasPassword: false,
      passkeyCount: 0,
      oauthProviderCount: 0
    });
    mocks.isGitHubOAuthConfigured.mockReturnValue(true);
    mocks.isGoogleOAuthConfigured.mockReturnValue(true);
    mocks.isWebAuthnConfigured.mockReturnValue(true);
  });

  it("shows password only when a password hash exists", async () => {
    mocks.getUsableLoginMethods.mockResolvedValue({
      hasPassword: true,
      passkeyCount: 0,
      oauthProviderCount: 0
    });
    const result = await listAccountDeleteReauthMethods("u1");
    expect(result.blockedReason).toBeNull();
    expect(result.methods.map((m) => m.method)).toEqual(["password"]);
  });

  it("hides password for GitHub-only users", async () => {
    mocks.listByUserId.mockResolvedValue([{ provider: "github", providerAccountId: "gh_1" }]);
    mocks.getUsableLoginMethods.mockResolvedValue({
      hasPassword: false,
      passkeyCount: 0,
      oauthProviderCount: 1
    });
    const result = await listAccountDeleteReauthMethods("u1");
    expect(result.methods.map((m) => m.method)).toEqual(["github"]);
    expect(result.methods.some((m) => m.method === "password")).toBe(false);
  });

  it("hides password for Google-only users", async () => {
    mocks.findByUserId.mockResolvedValue({ userId: "u1", googleSub: "sub_1" });
    mocks.getUsableLoginMethods.mockResolvedValue({
      hasPassword: false,
      passkeyCount: 0,
      oauthProviderCount: 0
    });
    const result = await listAccountDeleteReauthMethods("u1");
    expect(result.methods.map((m) => m.method)).toEqual(["google"]);
  });

  it("shows passkey when registered", async () => {
    mocks.getUsableLoginMethods.mockResolvedValue({
      hasPassword: false,
      passkeyCount: 2,
      oauthProviderCount: 0
    });
    const result = await listAccountDeleteReauthMethods("u1");
    expect(result.methods.map((m) => m.method)).toEqual(["passkey"]);
  });

  it("shows all usable methods for multi-method accounts", async () => {
    mocks.findByUserId.mockResolvedValue({ userId: "u1", googleSub: "sub_1" });
    mocks.listByUserId.mockResolvedValue([{ provider: "github", providerAccountId: "gh_1" }]);
    mocks.getUsableLoginMethods.mockResolvedValue({
      hasPassword: true,
      passkeyCount: 1,
      oauthProviderCount: 1
    });
    const result = await listAccountDeleteReauthMethods("u1");
    expect(result.methods.map((m) => m.method).sort()).toEqual(
      ["github", "google", "passkey", "password"].sort()
    );
  });

  it("hides unconfigured providers", async () => {
    mocks.listByUserId.mockResolvedValue([{ provider: "github", providerAccountId: "gh_1" }]);
    mocks.getUsableLoginMethods.mockResolvedValue({
      hasPassword: false,
      passkeyCount: 0,
      oauthProviderCount: 1
    });
    mocks.isGitHubOAuthConfigured.mockReturnValue(false);
    const result = await listAccountDeleteReauthMethods("u1");
    expect(result.blockedReason).toMatch(/No usable sign-in method/);
    expect(result.methods.find((m) => m.method === "github")?.available).toBe(false);
  });

  it("blocks safely when no usable methods exist", async () => {
    const result = await listAccountDeleteReauthMethods("u1");
    expect(result.blockedReason).toBeTruthy();
    expect(result.methods.filter((m) => m.available)).toHaveLength(0);
  });
});

describe("reauth proof lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createReauthProof.mockResolvedValue({ proofId: "reauth_x" });
    mocks.recordIdentityAudit.mockResolvedValue(undefined);
  });

  it("issues a purpose-bound proof", async () => {
    const issued = await issueReauthProof({
      userId: "u1",
      purpose: ACCOUNT_DELETE_PURPOSE,
      method: "github",
      sessionId: "sess_1"
    });
    expect(issued.token).toBeTruthy();
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mocks.createReauthProof).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "u1",
        purpose: "account_delete",
        method: "github",
        sessionId: "sess_1"
      })
    );
  });

  it("accepts a valid proof for the same user and purpose", async () => {
    mocks.consumeReauthProof.mockResolvedValue({
      proofId: "reauth_1",
      method: "passkey",
      userId: "u1",
      purpose: "account_delete"
    });
    const result = await consumeAccountDeleteReauthProof({
      token: "opaque-token",
      userId: "u1"
    });
    expect(result).toEqual({ ok: true, method: "passkey", proofId: "reauth_1" });
  });

  it("rejects wrong user", async () => {
    mocks.consumeReauthProof.mockResolvedValue(null);
    mocks.findReauthProofByHash.mockResolvedValue({
      proofId: "reauth_1",
      method: "password",
      userId: "other",
      purpose: "account_delete",
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000)
    });
    const result = await consumeAccountDeleteReauthProof({
      token: "opaque-token",
      userId: "u1"
    });
    expect(result).toEqual({ ok: false, reason: "wrong_user" });
  });

  it("rejects wrong purpose", async () => {
    mocks.consumeReauthProof.mockResolvedValue(null);
    mocks.findReauthProofByHash.mockResolvedValue({
      proofId: "reauth_1",
      method: "password",
      userId: "u1",
      purpose: "email_change",
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000)
    });
    const result = await consumeAccountDeleteReauthProof({
      token: "opaque-token",
      userId: "u1"
    });
    expect(result).toEqual({ ok: false, reason: "wrong_purpose" });
  });

  it("rejects expired proofs", async () => {
    mocks.consumeReauthProof.mockResolvedValue(null);
    mocks.findReauthProofByHash.mockResolvedValue({
      proofId: "reauth_1",
      method: "password",
      userId: "u1",
      purpose: "account_delete",
      consumedAt: null,
      expiresAt: new Date(Date.now() - 1000)
    });
    const result = await consumeAccountDeleteReauthProof({
      token: "opaque-token",
      userId: "u1"
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects reused proofs", async () => {
    mocks.consumeReauthProof.mockResolvedValue(null);
    mocks.findReauthProofByHash.mockResolvedValue({
      proofId: "reauth_1",
      method: "password",
      userId: "u1",
      purpose: "account_delete",
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000)
    });
    const result = await consumeAccountDeleteReauthProof({
      token: "opaque-token",
      userId: "u1"
    });
    expect(result).toEqual({ ok: false, reason: "already_consumed" });
  });

  it("treats a missing token as insufficient (session alone)", async () => {
    const result = await consumeAccountDeleteReauthProof({
      token: null,
      userId: "u1"
    });
    expect(result).toEqual({ ok: false, reason: "missing_proof" });
    expect(mocks.consumeReauthProof).not.toHaveBeenCalled();
  });
});
