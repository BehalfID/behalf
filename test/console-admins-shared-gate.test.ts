import { afterEach, describe, expect, it, vi } from "vitest";

describe("allowSharedConsoleAdmin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("respects an explicit true/false override regardless of environment", async () => {
    const { allowSharedConsoleAdmin } = await import("@/lib/consoleAdmins");

    vi.stubEnv("BEHALFID_ALLOW_SHARED_ADMIN", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(allowSharedConsoleAdmin()).toBe(true);

    vi.stubEnv("BEHALFID_ALLOW_SHARED_ADMIN", "false");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    expect(allowSharedConsoleAdmin()).toBe(false);
  });

  it("denies the shared password in a self-hosted (non-Vercel) production deployment", async () => {
    const { allowSharedConsoleAdmin } = await import("@/lib/consoleAdmins");

    vi.stubEnv("BEHALFID_ALLOW_SHARED_ADMIN", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");

    expect(allowSharedConsoleAdmin()).toBe(false);
  });

  it("denies the shared password on a real Vercel production deployment", async () => {
    const { allowSharedConsoleAdmin } = await import("@/lib/consoleAdmins");

    vi.stubEnv("BEHALFID_ALLOW_SHARED_ADMIN", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");

    expect(allowSharedConsoleAdmin()).toBe(false);
  });

  it("allows the shared password outside production", async () => {
    const { allowSharedConsoleAdmin } = await import("@/lib/consoleAdmins");

    vi.stubEnv("BEHALFID_ALLOW_SHARED_ADMIN", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");

    expect(allowSharedConsoleAdmin()).toBe(true);
  });

  it("allows the shared password on a Vercel preview deployment", async () => {
    const { allowSharedConsoleAdmin } = await import("@/lib/consoleAdmins");

    vi.stubEnv("BEHALFID_ALLOW_SHARED_ADMIN", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(allowSharedConsoleAdmin()).toBe(true);
  });
});
