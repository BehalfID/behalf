import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  linkIdentity,
  revokeUnverifiedAccountIdentities,
  resolveProviderLogin,
  unlinkIdentity
} from "@/lib/authProviders/externalIdentityService";
import type { NormalizedLoginIdentity } from "@/lib/authProviders/providers/types";

const mocks = vi.hoisted(() => ({
  getPostgresDb: vi.fn(() => ({})),
  findByProviderAccount: vi.fn(),
  findByUserAndProvider: vi.fn(),
  listByUserId: vi.fn(),
  createExternalIdentity: vi.fn(),
  deleteByUserAndProvider: vi.fn(),
  findByUserId: vi.fn(),
  updateUser: vi.fn(),
  existsByEmail: vi.fn(),
  countPasskeysByUserId: vi.fn(),
  passkeyExists: vi.fn(),
  recordIdentityAudit: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({
  getPostgresDb: mocks.getPostgresDb
}));

vi.mock("@/lib/repositories/postgres/externalIdentities", () => ({
  findByProviderAccount: mocks.findByProviderAccount,
  findByUserAndProvider: mocks.findByUserAndProvider,
  listByUserId: mocks.listByUserId,
  createExternalIdentity: mocks.createExternalIdentity,
  deleteByUserAndProvider: mocks.deleteByUserAndProvider
}));

vi.mock("@/lib/repositories/postgres/users", () => ({
  findByUserId: mocks.findByUserId,
  updateUser: mocks.updateUser,
  existsByEmail: mocks.existsByEmail
}));

vi.mock("@/lib/repositories/postgres/passkeys", () => ({
  countPasskeysByUserId: mocks.countPasskeysByUserId,
  passkeyExists: mocks.passkeyExists
}));

vi.mock("@/lib/authProviders/identityAudit", () => ({
  recordIdentityAudit: mocks.recordIdentityAudit
}));

const githubIdentity: NormalizedLoginIdentity = {
  provider: "github",
  providerAccountId: "999",
  username: "octocat",
  email: "dev@example.com",
  emailVerified: true,
  firstName: "Octo",
  lastName: "Cat"
};

describe("resolveProviderLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPostgresDb.mockReturnValue({});
    mocks.findByProviderAccount.mockResolvedValue(null);
    mocks.existsByEmail.mockResolvedValue(false);
  });

  it("returns existing_identity when the provider account is linked", async () => {
    mocks.findByProviderAccount.mockResolvedValue({ userId: "user_1" });
    await expect(resolveProviderLogin(githubIdentity)).resolves.toEqual({
      kind: "existing_identity",
      userId: "user_1"
    });
  });

  it("requires explicit link when verified email belongs to another account", async () => {
    mocks.existsByEmail.mockResolvedValue(true);
    await expect(resolveProviderLogin(githubIdentity)).resolves.toEqual({
      kind: "requires_explicit_link"
    });
  });

  it("registers when verified email is unclaimed", async () => {
    await expect(resolveProviderLogin(githubIdentity)).resolves.toEqual({
      kind: "new_account",
      email: "dev@example.com"
    });
  });

  it("rejects unverified provider email", async () => {
    await expect(
      resolveProviderLogin({ ...githubIdentity, email: null, emailVerified: false })
    ).resolves.toEqual({ kind: "email_unverified" });
  });
});

describe("linkIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPostgresDb.mockReturnValue({});
    mocks.findByProviderAccount.mockResolvedValue(null);
    mocks.createExternalIdentity.mockResolvedValue({});
    mocks.findByUserId.mockResolvedValue({ userId: "user_1", authProviders: ["password"] });
    mocks.updateUser.mockResolvedValue({});
    mocks.recordIdentityAudit.mockResolvedValue(undefined);
  });

  it("rejects when the identity is linked to another user", async () => {
    mocks.findByProviderAccount.mockResolvedValue({ userId: "other_user" });
    await expect(
      linkIdentity({ userId: "user_1", identity: githubIdentity })
    ).resolves.toEqual({ ok: false, code: "identity_linked_elsewhere" });
    expect(mocks.recordIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "identity_link_rejected" })
    );
  });
});

describe("linkIdentity on an unverified account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPostgresDb.mockReturnValue({});
    mocks.findByProviderAccount.mockResolvedValue(null);
    mocks.recordIdentityAudit.mockResolvedValue(undefined);
  });

  it("refuses to link a provider before the account email is verified", async () => {
    mocks.findByUserId.mockResolvedValue({ userId: "user_1", emailVerified: false });
    await expect(
      linkIdentity({ userId: "user_1", identity: githubIdentity })
    ).resolves.toEqual({ ok: false, code: "account_unverified" });
    expect(mocks.createExternalIdentity).not.toHaveBeenCalled();
    expect(mocks.recordIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "identity_link_rejected", context: "account_unverified" })
    );
  });

  it("links once the account email is verified", async () => {
    mocks.findByUserId.mockResolvedValue({ userId: "user_1", emailVerified: true, authProviders: ["password"] });
    mocks.createExternalIdentity.mockResolvedValue({});
    mocks.updateUser.mockResolvedValue({});
    await expect(
      linkIdentity({ userId: "user_1", identity: githubIdentity })
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
  });
});

describe("revokeUnverifiedAccountIdentities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPostgresDb.mockReturnValue({});
    mocks.recordIdentityAudit.mockResolvedValue(undefined);
    mocks.findByUserId.mockResolvedValue({ userId: "user_1", authProviders: ["password", "github"] });
    mocks.updateUser.mockResolvedValue({});
  });

  it("deletes every linked identity and audits each removal", async () => {
    mocks.listByUserId.mockResolvedValue([
      { provider: "github", providerAccountId: "999", providerUsername: "attacker" }
    ]);
    mocks.deleteByUserAndProvider.mockResolvedValue({ acknowledged: true, deletedCount: 1 });

    await expect(revokeUnverifiedAccountIdentities({ userId: "user_1" })).resolves.toBe(1);

    expect(mocks.deleteByUserAndProvider).toHaveBeenCalledWith({}, "user_1", "github");
    expect(mocks.updateUser).toHaveBeenCalledWith({}, "user_1", { authProviders: ["password"] });
    expect(mocks.recordIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "identity_unlinked", context: "password_reset_unverified_account" })
    );
  });
});

describe("unlinkIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPostgresDb.mockReturnValue({});
    mocks.findByUserAndProvider.mockResolvedValue({
      identityId: "extid_1",
      providerAccountId: "999",
      providerUsername: "octocat"
    });
    mocks.findByUserId.mockResolvedValue({ userId: "user_1", passwordHash: null });
    mocks.listByUserId.mockResolvedValue([
      { provider: "github", providerAccountId: "999" }
    ]);
    mocks.countPasskeysByUserId.mockResolvedValue(0);
    mocks.deleteByUserAndProvider.mockResolvedValue({});
    mocks.updateUser.mockResolvedValue({});
    mocks.recordIdentityAudit.mockResolvedValue(undefined);
  });

  it("refuses to remove the last sign-in method", async () => {
    await expect(
      unlinkIdentity({ userId: "user_1", provider: "github" })
    ).resolves.toEqual({ ok: false, code: "unlink_last_method" });
    expect(mocks.recordIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "method_removal_rejected" })
    );
  });

  it("allows unlink when a password remains", async () => {
    mocks.findByUserId.mockResolvedValue({ userId: "user_1", passwordHash: "hash" });
    await expect(
      unlinkIdentity({ userId: "user_1", provider: "github" })
    ).resolves.toEqual({ ok: true });
  });

  it("refuses unlink that would leave passkey-only", async () => {
    mocks.countPasskeysByUserId.mockResolvedValue(1);
    await expect(
      unlinkIdentity({ userId: "user_1", provider: "github" })
    ).resolves.toEqual({ ok: false, code: "passkey_only_forbidden" });
  });
});
