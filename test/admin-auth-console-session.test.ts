import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countConsoleAdmins: vi.fn(),
  allowSharedConsoleAdmin: vi.fn(),
  findActiveConsoleAdmin: vi.fn()
}));

vi.mock("@/lib/consoleAdmins", () => ({
  countConsoleAdmins: mocks.countConsoleAdmins,
  allowSharedConsoleAdmin: mocks.allowSharedConsoleAdmin,
  findActiveConsoleAdmin: mocks.findActiveConsoleAdmin
}));

function request(cookie: string) {
  return new NextRequest("https://console.behalfid.com/api/console/agents", {
    headers: { cookie: `behalfid_console=${cookie}`, origin: "https://console.behalfid.com" }
  });
}

describe("console session validation re-checks live admin state on every request", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BEHALFID_ADMIN_PASSWORD", "test-shared-password");
    mocks.countConsoleAdmins.mockReset();
    mocks.allowSharedConsoleAdmin.mockReset();
    mocks.findActiveConsoleAdmin.mockReset();
  });

  it("rejects a shared-password session once named admins exist and the shared flag is off", async () => {
    const { createConsoleSessionValue, isValidConsoleSession } = await import("@/lib/adminAuth");
    const cookie = createConsoleSessionValue();
    expect(cookie).toBeTruthy();

    // Bootstrap state: no admins yet, shared password still works.
    mocks.countConsoleAdmins.mockResolvedValue(0);
    mocks.allowSharedConsoleAdmin.mockReturnValue(false);
    await expect(isValidConsoleSession(cookie ?? undefined)).resolves.toBe(true);

    // Named admins now exist and the operator has retired the shared password.
    // A cookie forged offline from the still-known BEHALFID_ADMIN_PASSWORD must
    // stop being accepted, even though its HMAC signature is still valid.
    mocks.countConsoleAdmins.mockResolvedValue(1);
    mocks.allowSharedConsoleAdmin.mockReturnValue(false);
    await expect(isValidConsoleSession(cookie ?? undefined)).resolves.toBe(false);
  });

  it("accepts a shared-password session while BEHALFID_ALLOW_SHARED_ADMIN=true even with named admins", async () => {
    const { createConsoleSessionValue, isValidConsoleSession } = await import("@/lib/adminAuth");
    const cookie = createConsoleSessionValue();

    mocks.countConsoleAdmins.mockResolvedValue(2);
    mocks.allowSharedConsoleAdmin.mockReturnValue(true);
    await expect(isValidConsoleSession(cookie ?? undefined)).resolves.toBe(true);
  });

  it("denies /api/console/** requests carrying a no-longer-allowed shared session", async () => {
    const { createConsoleSessionValue, requireConsoleApi } = await import("@/lib/adminAuth");
    const cookie = createConsoleSessionValue();
    mocks.countConsoleAdmins.mockResolvedValue(1);
    mocks.allowSharedConsoleAdmin.mockReturnValue(false);

    const response = await requireConsoleApi(request(cookie as string));
    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
  });

  it("rejects a named-admin session once that admin is disabled", async () => {
    const { createConsoleAdminSessionValue, isValidConsoleSession } = await import("@/lib/adminAuth");
    vi.stubEnv("BEHALFID_SETUP_TOKEN", "test-session-signing-secret");
    const cookie = createConsoleAdminSessionValue("cad_disabled");

    mocks.findActiveConsoleAdmin.mockResolvedValue(null);
    await expect(isValidConsoleSession(cookie)).resolves.toBe(false);

    mocks.findActiveConsoleAdmin.mockResolvedValue({ adminId: "cad_disabled", role: "owner" });
    await expect(isValidConsoleSession(cookie)).resolves.toBe(true);
  });
});
