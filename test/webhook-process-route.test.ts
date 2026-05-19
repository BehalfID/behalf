import { beforeEach, describe, expect, it, vi } from "vitest";

const processMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  requireSetupTokenOrConsoleApi: vi.fn(),
  processWebhookEvents: vi.fn()
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: processMocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/lib/adminAuth", () => ({
  requireSetupTokenOrConsoleApi: processMocks.requireSetupTokenOrConsoleApi
}));
vi.mock("@/lib/webhookWorker", () => ({
  processWebhookEvents: processMocks.processWebhookEvents
}));

describe("GET /api/webhooks/process", () => {
  beforeEach(() => {
    processMocks.checkRateLimit.mockResolvedValue({ limited: false });
    processMocks.requireSetupTokenOrConsoleApi.mockReturnValue(null);
    processMocks.processWebhookEvents.mockResolvedValue({
      processed: 1,
      completed: 0,
      retried: 1,
      failed: 0
    });
  });

  it("requires worker auth before processing events", async () => {
    processMocks.requireSetupTokenOrConsoleApi.mockReturnValue(
      Response.json({ error: "Console authentication or setup token required." }, { status: 401 })
    );
    const { GET } = await import("@/app/api/webhooks/process/route");

    const response = await GET(new Request("http://localhost/api/webhooks/process") as never);

    expect(response.status).toBe(401);
    expect(processMocks.processWebhookEvents).not.toHaveBeenCalled();
  });

  it("returns a clear processing summary", async () => {
    const { GET } = await import("@/app/api/webhooks/process/route");

    const response = await GET(new Request("http://localhost/api/webhooks/process") as never);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      status: "ok",
      processed: 1,
      completed: 0,
      retried: 1,
      failed: 0
    });
  });
});
