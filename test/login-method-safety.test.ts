import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canAddPasskey,
  canRemoveLoginMethod,
  getUsableLoginMethods
} from "@/lib/authProviders/loginMethodSafety";

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  identityFind: vi.fn(),
  passkeyCount: vi.fn(),
  passkeyExists: vi.fn()
}));

vi.mock("@/models/DeveloperUser", () => ({
  default: { findOne: mocks.userFindOne }
}));
vi.mock("@/models/ExternalIdentity", () => ({
  default: { find: mocks.identityFind }
}));
vi.mock("@/models/PasskeyCredential", () => ({
  default: {
    countDocuments: mocks.passkeyCount,
    exists: mocks.passkeyExists
  }
}));

function mockUser(passwordHash: string | null) {
  mocks.userFindOne.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(
        passwordHash === null ? { userId: "u1" } : { userId: "u1", passwordHash }
      )
    })
  });
}

function mockIdentities(providers: Array<"github" | "google">) {
  mocks.identityFind.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(
        providers.map((provider) => ({
          provider,
          providerAccountId: `${provider}-1`
        }))
      )
    })
  });
}

describe("loginMethodSafety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.passkeyExists.mockResolvedValue({ _id: "x" });
  });

  it("password only — cannot remove password", async () => {
    mockUser("hash");
    mockIdentities([]);
    mocks.passkeyCount.mockResolvedValue(0);
    await expect(canRemoveLoginMethod("u1", { kind: "password" })).resolves.toEqual({
      allowed: false,
      reason: "unlink_last_method"
    });
  });

  it("github only — cannot unlink github", async () => {
    mockUser(null);
    mockIdentities(["github"]);
    mocks.passkeyCount.mockResolvedValue(0);
    await expect(canRemoveLoginMethod("u1", { kind: "github" })).resolves.toEqual({
      allowed: false,
      reason: "unlink_last_method"
    });
  });

  it("passkey only — cannot remove last passkey", async () => {
    mockUser(null);
    mockIdentities([]);
    mocks.passkeyCount.mockResolvedValue(1);
    await expect(
      canRemoveLoginMethod("u1", { kind: "passkey", passkeyCredentialRecordId: "pk_1" })
    ).resolves.toEqual({ allowed: false, reason: "unlink_last_method" });
  });

  it("github + passkey — can remove github? no — would leave passkey-only", async () => {
    mockUser(null);
    mockIdentities(["github"]);
    mocks.passkeyCount.mockResolvedValue(1);
    await expect(canRemoveLoginMethod("u1", { kind: "github" })).resolves.toEqual({
      allowed: false,
      reason: "passkey_only_forbidden"
    });
    await expect(canAddPasskey("u1")).resolves.toBe(true);
  });

  it("multiple passkeys with password — can remove a passkey", async () => {
    mockUser("hash");
    mockIdentities([]);
    mocks.passkeyCount.mockResolvedValue(2);
    await expect(
      canRemoveLoginMethod("u1", { kind: "passkey", passkeyCredentialRecordId: "pk_1" })
    ).resolves.toEqual({ allowed: true });
  });

  it("password + github + passkey — can remove any one", async () => {
    mockUser("hash");
    mockIdentities(["github"]);
    mocks.passkeyCount.mockResolvedValue(1);
    await expect(canRemoveLoginMethod("u1", { kind: "password" })).resolves.toEqual({
      allowed: true
    });
    await expect(canRemoveLoginMethod("u1", { kind: "github" })).resolves.toEqual({
      allowed: true
    });
    await expect(
      canRemoveLoginMethod("u1", { kind: "passkey", passkeyCredentialRecordId: "pk_1" })
    ).resolves.toEqual({ allowed: true });
  });

  it("inventories usable methods", async () => {
    mockUser("hash");
    mockIdentities(["github", "google"]);
    mocks.passkeyCount.mockResolvedValue(2);
    const snapshot = await getUsableLoginMethods("u1");
    expect(snapshot.hasPassword).toBe(true);
    expect(snapshot.oauthProviderCount).toBe(2);
    expect(snapshot.passkeyCount).toBe(2);
    expect(snapshot.nonPasskeyFactorCount).toBe(3);
    expect(snapshot.kinds).toEqual(
      expect.arrayContaining(["password", "github", "google", "passkey"])
    );
  });

  it("cannot add passkey without recovery method", async () => {
    mockUser(null);
    mockIdentities([]);
    mocks.passkeyCount.mockResolvedValue(0);
    await expect(canAddPasskey("u1")).resolves.toBe(false);
  });
});
