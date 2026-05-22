import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentFixture, rawApiKey } from "./fixtures";

const routeMocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  authenticateAgent: vi.fn(),
  authenticateDeveloperToken: vi.fn(),
  checkAndIncrementVerifications: vi.fn(),
  checkRateLimit: vi.fn(),
  verifyAction: vi.fn(),
  createWebhookEvent: vi.fn(),
  emitWebhookEvent: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: routeMocks.connectToDatabase }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authenticateAgent: routeMocks.authenticateAgent
}));
vi.mock("@/lib/developerToken", () => ({
  authenticateDeveloperToken: routeMocks.authenticateDeveloperToken
}));
vi.mock("@/lib/quota", () => ({
  checkAndIncrementVerifications: routeMocks.checkAndIncrementVerifications,
  quotaErrorDetails: (result: {
    code?: string;
    plan?: string;
    limit?: number;
    upgradeHint?: string;
  }) => ({
    code: result.code,
    currentPlan: result.plan,
    limit: result.limit,
    upgradeHint: result.upgradeHint
  })
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: routeMocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/lib/verify", () => ({ verifyAction: routeMocks.verifyAction }));
vi.mock("@/lib/webhooks", () => ({
  createWebhookEvent: routeMocks.createWebhookEvent,
  emitWebhookEvent: routeMocks.emitWebhookEvent
}));

function verifyRequest(body: unknown, apiKey = rawApiKey) {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  }) as never;
}

describe("POST /api/verify route", () => {
  beforeEach(() => {
    routeMocks.connectToDatabase.mockResolvedValue(undefined);
    routeMocks.authenticateAgent.mockResolvedValue({ agent: agentFixture(), error: null });
    routeMocks.authenticateDeveloperToken.mockResolvedValue({ tokenDoc: null, error: null });
    routeMocks.checkAndIncrementVerifications.mockResolvedValue({ allowed: true });
    routeMocks.checkRateLimit.mockResolvedValue({ limited: false });
    routeMocks.verifyAction.mockResolvedValue({
      requestId: "req_test",
      permissionId: "perm_test",
      allowed: true,
      reason: "Action allowed by active permission.",
      risk: "low"
    });
    routeMocks.createWebhookEvent.mockReturnValue({ eventId: "evt_test" });
    routeMocks.emitWebhookEvent.mockResolvedValue(undefined);
  });

  it("returns auth-failure route responses before verification", async () => {
    routeMocks.authenticateAgent.mockResolvedValue({
      agent: null,
      error: "Missing or invalid API key."
    });
    const { POST } = await import("@/app/api/verify/route");

    const missing = await POST(verifyRequest({ agentId: "agent_test", action: "purchase" }, ""));
    const invalid = await POST(verifyRequest({ agentId: "agent_test", action: "purchase" }, "not-valid"));

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(routeMocks.verifyAction).not.toHaveBeenCalled();
    expect(routeMocks.emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns a denied decision, queues a denied webhook, and omits raw secrets", async () => {
    routeMocks.verifyAction.mockResolvedValue({
      requestId: "req_denied",
      permissionId: null,
      allowed: false,
      reason: "No active permission exists for this action.",
      risk: "high"
    });
    routeMocks.createWebhookEvent.mockReturnValue({ eventId: "evt_denied" });
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest({ agentId: "agent_test", action: "purchase" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      requestId: "req_denied",
      allowed: false,
      reason: "No active permission exists for this action.",
      risk: "high"
    });
    expect(routeMocks.createWebhookEvent).toHaveBeenCalledWith(
      "acct_test",
      "verification.denied",
      expect.not.objectContaining({ apiKey: rawApiKey }),
      "dev_test"
    );
    expect(routeMocks.emitWebhookEvent).toHaveBeenCalledWith({ eventId: "evt_denied" });
    expect(JSON.stringify(json)).not.toContain(rawApiKey);
  });

  it("queues an allowed webhook after an allowed verification", async () => {
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest({
      agentId: "agent_test",
      action: "purchase",
      amount: 25,
      vendor: "amazon.com"
    }));

    expect(response.status).toBe(200);
    expect(routeMocks.createWebhookEvent).toHaveBeenCalledWith(
      "acct_test",
      "verification.allowed",
      expect.objectContaining({
        requestId: "req_test",
        agentId: "agent_test",
        action: "purchase",
        allowed: true,
        risk: "low",
        permissionId: "perm_test"
      }),
      "dev_test"
    );
  });

  it("malformed request bodies fail before auth and cannot default to allowed", async () => {
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest("{bad json"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "Request body must be valid JSON." });
    expect(routeMocks.authenticateAgent).not.toHaveBeenCalled();
    expect(routeMocks.verifyAction).not.toHaveBeenCalled();
  });

  it("does not verify or emit webhooks when quota enforcement denies", async () => {
    routeMocks.checkAndIncrementVerifications.mockResolvedValue({
      allowed: false,
      code: "VERIFICATION_LIMIT_REACHED",
      plan: "free",
      limit: 10_000,
      reason: "Monthly verification limit reached.",
      upgradeHint: "Upgrade to Pro to continue."
    });
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest({ agentId: "agent_test", action: "purchase" }));
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json).toEqual({
      error: "Monthly verification limit reached.",
      code: "VERIFICATION_LIMIT_REACHED",
      currentPlan: "free",
      limit: 10_000,
      upgradeHint: "Upgrade to Pro to continue."
    });
    expect(routeMocks.verifyAction).not.toHaveBeenCalled();
    expect(routeMocks.emitWebhookEvent).not.toHaveBeenCalled();
  });
});
