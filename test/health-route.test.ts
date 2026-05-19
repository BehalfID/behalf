import { describe, expect, it, vi } from "vitest";

const healthMocks = vi.hoisted(() => ({
  requireSetupTokenOrConsoleApi: vi.fn(),
  checkRateLimit: vi.fn(),
  connectToDatabase: vi.fn()
}));

vi.mock("@/lib/adminAuth", () => ({
  requireSetupTokenOrConsoleApi: healthMocks.requireSetupTokenOrConsoleApi
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: healthMocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/lib/db", () => ({ connectToDatabase: healthMocks.connectToDatabase }));
vi.mock("mongoose", () => ({
  default: { connection: { readyState: 1 } }
}));

describe("health routes", () => {
  it("returns a safe public liveness shape", async () => {
    const { GET } = await import("@/app/api/health/route");

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      status: "ok",
      service: "behalfid",
      timestamp: expect.any(String)
    });
  });

  it("requires auth before exposing database status", async () => {
    healthMocks.checkRateLimit.mockResolvedValue({ limited: false });
    healthMocks.requireSetupTokenOrConsoleApi.mockReturnValue(
      Response.json({ error: "Console authentication or setup token required." }, { status: 401 })
    );
    const { GET } = await import("@/app/api/health/db/route");

    const response = await GET(new Request("http://localhost/api/health/db") as never);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Console authentication or setup token required." });
    expect(healthMocks.connectToDatabase).not.toHaveBeenCalled();
  });
});
