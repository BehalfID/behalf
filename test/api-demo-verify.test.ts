import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  checkDemoRateLimit: vi.fn(),
  runDemoScenario: vi.fn()
}));

vi.mock("@/lib/rateLimit", () => ({
  checkDemoRateLimit: routeMocks.checkDemoRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));

vi.mock("@/lib/demoScenarios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demoScenarios")>();
  return {
    ...actual,
    runDemoScenario: routeMocks.runDemoScenario
  };
});

function demoRequest(body: unknown) {
  return new Request("http://localhost/api/demo/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  }) as never;
}

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "req_demotest123",
    allowed: true,
    approvalRequired: false,
    reason: "Action allowed by active permission.",
    risk: "low" as const,
    timestamp: "2026-01-01T00:00:00.000Z",
    scenarioId: "github-read-allowed" as const,
    ...overrides
  };
}

describe("POST /api/demo/verify", () => {
  beforeEach(() => {
    routeMocks.checkDemoRateLimit.mockResolvedValue({ limited: false });
    routeMocks.runDemoScenario.mockReturnValue(makeResult());
  });

  it("returns 429 when rate limited", async () => {
    routeMocks.checkDemoRateLimit.mockResolvedValue({ limited: true });
    const { POST } = await import("@/app/api/demo/verify/route");
    const res = await POST(demoRequest({ scenarioId: "github-read-allowed" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when scenarioId is missing", async () => {
    const { POST } = await import("@/app/api/demo/verify/route");
    const res = await POST(demoRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/scenarioId/i);
  });

  it("returns 400 for an unknown scenarioId", async () => {
    const { POST } = await import("@/app/api/demo/verify/route");
    const res = await POST(demoRequest({ scenarioId: "not-a-real-scenario" }));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/unknown/i);
  });

  it("returns 400 for non-JSON body", async () => {
    const { POST } = await import("@/app/api/demo/verify/route");
    const req = new Request("http://localhost/api/demo/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json"
    }) as never;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns allowed decision with real requestId", async () => {
    routeMocks.runDemoScenario.mockReturnValue(makeResult({ allowed: true }));
    const { POST } = await import("@/app/api/demo/verify/route");
    const res = await POST(demoRequest({ scenarioId: "github-read-allowed" }));
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.allowed).toBe(true);
    expect(data.approvalRequired).toBe(false);
    expect(typeof data.requestId).toBe("string");
    expect((data.requestId as string).length).toBeGreaterThan(0);
    expect(data.demo).toBe(true);
    expect(data.timestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns denied decision for migration-denied", async () => {
    routeMocks.runDemoScenario.mockReturnValue(makeResult({
      allowed: false,
      approvalRequired: false,
      reason: "No active permission exists for this action.",
      risk: "high",
      scenarioId: "migration-denied"
    }));
    const { POST } = await import("@/app/api/demo/verify/route");
    const res = await POST(demoRequest({ scenarioId: "migration-denied" }));
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.allowed).toBe(false);
    expect(data.approvalRequired).toBe(false);
    expect(data.reason).toBe("No active permission exists for this action.");
  });

  it("returns needs_approval decision for deploy-approval scenario", async () => {
    routeMocks.runDemoScenario.mockReturnValue(makeResult({
      allowed: false,
      approvalRequired: true,
      reason: "Permission requires approval before execution.",
      risk: "medium",
      scenarioId: "deploy-approval"
    }));
    const { POST } = await import("@/app/api/demo/verify/route");
    const res = await POST(demoRequest({ scenarioId: "deploy-approval" }));
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.allowed).toBe(false);
    expect(data.approvalRequired).toBe(true);
    expect(data.risk).toBe("medium");
  });

  it("passes scenarioId to runDemoScenario", async () => {
    const { POST } = await import("@/app/api/demo/verify/route");
    await POST(demoRequest({ scenarioId: "push-main-denied" }));
    expect(routeMocks.runDemoScenario).toHaveBeenCalledWith("push-main-denied");
  });
});
