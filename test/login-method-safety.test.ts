import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canAddPasskey,
  canRemoveLoginMethod,
  getUsableLoginMethods
} from "@/lib/authProviders/loginMethodSafety";

const mocks = vi.hoisted(() => ({
  getPostgresDb: vi.fn(() => ({})),
  findByUserId: vi.fn(),
  listByUserId: vi.fn(),
  countPasskeysByUserId: vi.fn(),
  passkeyExists: vi.fn()
}));

vi.mock("@/lib/db/postgres", () => ({
  getPostgresDb: mocks.getPostgresDb
}));

vi.mock("@/lib/repositories/postgres/users", () => ({
  findByUserId: mocks.findByUserId
}));

vi.mock("@/lib/repositories/postgres/externalIdentities", () => ({
  listByUserId: mocks.listByUserId
}));

vi.mock("@/lib/repositories/postgres/passkeys", () => ({
  countPasskeysByUserId: mocks.countPasskeysByUserId,
  passkeyExists: mocks.passkeyExists
}));

function mockUser(passwordHash: string | null) {
  mocks.findByUserId.mockResolvedValue(
    passwordHash === null ? { userId: "u1" } : { userId: "u1", passwordHash }
  );
}

function mockIdentities(providers: Array<"github" | "google">) {
  mocks.listByUserId.mockResolvedValue(
    providers.map((provider) => ({
      provider,
      providerAccountId: `${provider}-1`
    }))
  );
}

describe("loginMethodSafety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPostgresDb.mockReturnValue({});
    mocks.passkeyExists.mockResolvedValue(true);
  });

  it("password only — cannot remove password", async () => {
    mockUser("hash");
    mockIdentities([]);
    mocks.countPasskeysByUserId.mockResolvedValue(0);
    await expect(canRemoveLoginMethod("u1", { kind: "password" })).resolves.toEqual({
      allowed: false,
      reason: "unlink_last_method"
    });
  });

  it("github only — cannot unlink github", async () => {
    mockUser(null);
    mockIdentities(["github"]);
    mocks.countPasskeysByUserId.mockResolvedValue(0);
    await expect(canRemoveLoginMethod("u1", { kind: "github" })).resolves.toEqual({
      allowed: false,
      reason: "unlink_last_method"
    });
  });

  it("passkey only — cannot remove last passkey", async () => {
    mockUser(null);
    mockIdentities([]);
    mocks.countPasskeysByUserId.mockResolvedValue(1);
    await expect(
      canRemoveLoginMethod("u1", { kind: "passkey", passkeyCredentialRecordId: "pk_1" })
    ).resolves.toEqual({ allowed: false, reason: "unlink_last_method" });
  });

  it("github + passkey — can remove github? no — would leave passkey-only", async () => {
    mockUser(null);
    mockIdentities(["github"]);
    mocks.countPasskeysByUserId.mockResolvedValue(1);
    await expect(canRemoveLoginMethod("u1", { kind: "github" })).resolves.toEqual({
      allowed: false,
      reason: "passkey_only_forbidden"
    });
    await expect(canAddPasskey("u1")).resolves.toBe(true);
  });

  it("multiple passkeys with password — can remove a passkey", async () => {
    mockUser("hash");
    mockIdentities([]);
    mocks.countPasskeysByUserId.mockResolvedValue(2);
    await expect(
      canRemoveLoginMethod("u1", { kind: "passkey", passkeyCredentialRecordId: "pk_1" })
    ).resolves.toEqual({ allowed: true });
  });

  it("password + github + passkey — can remove any one", async () => {
    mockUser("hash");
    mockIdentities(["github"]);
    mocks.countPasskeysByUserId.mockResolvedValue(1);
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
    mocks.countPasskeysByUserId.mockResolvedValue(2);
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
    mocks.countPasskeysByUserId.mockResolvedValue(0);
    await expect(canAddPasskey("u1")).resolves.toBe(false);
  });
});
