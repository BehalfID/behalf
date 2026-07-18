import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanupUnverifiedAccounts: vi.fn()
}));

vi.mock("@/lib/authCleanup", () => ({
  cleanupUnverifiedAccounts: mocks.cleanupUnverifiedAccounts
}));
vi.mock("@/lib/adminAuth", () => ({
  requireSetupTokenOrConsoleApi: vi.fn(() => null)
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));

describe("GET /api/auth/cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cleanupUnverifiedAccounts.mockResolvedValue({ scanned: 2, deleted: 1, errors: 0 });
  });

  it("returns cleanup summary", async () => {
    const { GET } = await import("@/app/api/auth/cleanup/route");
    const res = await GET(new Request("http://example.test/api/auth/cleanup") as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "ok",
      scanned: 2,
      deleted: 1,
      errors: 0
    });
  });
});
