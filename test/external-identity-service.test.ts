import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  linkIdentity,
  resolveProviderLogin,
  unlinkIdentity
} from "@/lib/authProviders/externalIdentityService";
import type { NormalizedLoginIdentity } from "@/lib/authProviders/providers/types";

const mocks = vi.hoisted(() => ({
  identityFindOne: vi.fn(),
  identityCreate: vi.fn(),
  identityDeleteOne: vi.fn(),
  identityCountDocuments: vi.fn(),
  identityUpdateOne: vi.fn(),
  identityFind: vi.fn(),
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
  userExists: vi.fn(),
  recordIdentityAudit: vi.fn(),
  passkeyCount: vi.fn(),
  passkeyExists: vi.fn()
}));

vi.mock("@/models/ExternalIdentity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/ExternalIdentity")>();
  return {
    ...actual,
    default: {
      findOne: mocks.identityFindOne,
      find: mocks.identityFind,
      create: mocks.identityCreate,
      deleteOne: mocks.identityDeleteOne,
      countDocuments: mocks.identityCountDocuments,
      updateOne: mocks.identityUpdateOne
    }
  };
});
vi.mock("@/models/DeveloperUser", () => ({
  default: {
    findOne: mocks.userFindOne,
    updateOne: mocks.userUpdateOne,
    exists: mocks.userExists
  }
}));
vi.mock("@/models/PasskeyCredential", () => ({
  default: {
    countDocuments: mocks.passkeyCount,
    exists: mocks.passkeyExists
  }
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
    mocks.identityFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
    });
    mocks.userExists.mockResolvedValue(null);
  });

  it("returns existing_identity when the provider account is linked", async () => {
    mocks.identityFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ userId: "user_1" })
      })
    });
    await expect(resolveProviderLogin(githubIdentity)).resolves.toEqual({
      kind: "existing_identity",
      userId: "user_1"
    });
  });

  it("requires explicit link when verified email belongs to another account", async () => {
    mocks.userExists.mockResolvedValue({ _id: "exists" });
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
    mocks.identityFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
    });
    mocks.identityCreate.mockResolvedValue({});
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ userId: "user_1", authProviders: ["password"] })
      })
    });
    mocks.userUpdateOne.mockResolvedValue({});
    mocks.recordIdentityAudit.mockResolvedValue(undefined);
  });

  it("rejects when the identity is linked to another user", async () => {
    mocks.identityFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ userId: "other_user" })
      })
    });
    await expect(
      linkIdentity({ userId: "user_1", identity: githubIdentity })
    ).resolves.toEqual({ ok: false, code: "identity_linked_elsewhere" });
    expect(mocks.recordIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "identity_link_rejected" })
    );
  });
});

describe("unlinkIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.identityFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          identityId: "extid_1",
          providerAccountId: "999",
          providerUsername: "octocat"
        })
      })
    });
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ userId: "user_1", passwordHash: null })
      })
    });
    mocks.identityFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { provider: "github", providerAccountId: "999" }
        ])
      })
    });
    mocks.passkeyCount.mockResolvedValue(0);
    mocks.identityDeleteOne.mockResolvedValue({});
    mocks.userUpdateOne.mockResolvedValue({});
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
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ userId: "user_1", passwordHash: "hash" })
      })
    });
    await expect(
      unlinkIdentity({ userId: "user_1", provider: "github" })
    ).resolves.toEqual({ ok: true });
  });

  it("refuses unlink that would leave passkey-only", async () => {
    mocks.passkeyCount.mockResolvedValue(1);
    await expect(
      unlinkIdentity({ userId: "user_1", provider: "github" })
    ).resolves.toEqual({ ok: false, code: "passkey_only_forbidden" });
  });
});
