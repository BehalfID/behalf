import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentFixture } from "./fixtures";

const routeMocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  authenticateAgent: vi.fn(),
  checkRateLimit: vi.fn(),
  verifyAction: vi.fn(),
  emitWebhookEvent: vi.fn(),
  createWebhookEvent: vi.fn(),
  fetchPublicWebRead: vi.fn()
}));

vi.mock("@/lib/db", () => ({ connectToDatabase: routeMocks.connectToDatabase }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authenticateAgent: routeMocks.authenticateAgent
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
vi.mock("@/lib/actionGateway", () => ({ fetchPublicWebRead: routeMocks.fetchPublicWebRead }));

function actionRequest(body: unknown) {
  return new Request("http://localhost/api/actions/execute", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer bhf_sk_test" },
    body: JSON.stringify(body)
  }) as never;
}

describe("POST /api/actions/execute enforcement", () => {
  beforeEach(() => {
    routeMocks.connectToDatabase.mockResolvedValue(undefined);
    routeMocks.authenticateAgent.mockResolvedValue({ agent: agentFixture(), error: null });
    routeMocks.checkRateLimit.mockResolvedValue({ limited: false });
    routeMocks.verifyAction.mockResolvedValue({
      requestId: "req_gateway",
      permissionId: "perm_gateway",
      allowed: true,
      reason: "Action allowed by active permission.",
      risk: "low"
    });
    routeMocks.createWebhookEvent.mockReturnValue({ eventId: "evt_gateway" });
    routeMocks.emitWebhookEvent.mockResolvedValue(undefined);
    routeMocks.fetchPublicWebRead.mockResolvedValue({
      url: "https://example.com/",
      status: 200,
      contentType: "text/plain",
      title: null,
      excerpt: "ok",
      truncated: false
    });
  });

  it("verifies before executing", async () => {
    const { POST } = await import("@/app/api/actions/execute/route");

    const response = await POST(actionRequest({
      agentId: "agent_test",
      action: "browse_web",
      resource: "web",
      input: { url: "https://example.com/" }
    }));

    expect(response.status).toBe(200);
    expect(routeMocks.verifyAction).toHaveBeenCalledWith(expect.objectContaining({
      agentId: "agent_test",
      action: "browse_web",
      vendor: "web"
    }));
    expect(routeMocks.fetchPublicWebRead).toHaveBeenCalledWith("https://example.com/");
    expect(routeMocks.verifyAction.mock.invocationCallOrder[0]).toBeLessThan(
      routeMocks.fetchPublicWebRead.mock.invocationCallOrder[0]
    );
  });

  it("does not execute before verification resolves", async () => {
    let resolveVerification: (decision: unknown) => void = () => {};
    routeMocks.verifyAction.mockReturnValue(new Promise((resolve) => {
      resolveVerification = resolve;
    }));
    const { POST } = await import("@/app/api/actions/execute/route");

    const pendingResponse = POST(actionRequest({
      agentId: "agent_test",
      action: "browse_web",
      resource: "web",
      input: { url: "https://example.com/" }
    }));

    await Promise.resolve();
    expect(routeMocks.fetchPublicWebRead).not.toHaveBeenCalled();

    resolveVerification({
      requestId: "req_gateway",
      permissionId: "perm_gateway",
      allowed: true,
      reason: "Action allowed by active permission.",
      risk: "low"
    });

    await pendingResponse;
    expect(routeMocks.fetchPublicWebRead).toHaveBeenCalledWith("https://example.com/");
  });

  it("does not call the executor when verification denies", async () => {
    routeMocks.verifyAction.mockResolvedValue({
      requestId: "req_denied",
      permissionId: null,
      allowed: false,
      reason: "No active permission exists for this action.",
      risk: "high"
    });
    const { POST } = await import("@/app/api/actions/execute/route");

    const response = await POST(actionRequest({
      agentId: "agent_test",
      action: "browse_web",
      resource: "web",
      input: { url: "https://example.com/" }
    }));
    const json = await response.json();

    expect(json).toEqual(expect.objectContaining({ allowed: false, executed: false }));
    expect(routeMocks.fetchPublicWebRead).not.toHaveBeenCalled();
  });

  it("fails closed and does not call the executor when verification throws", async () => {
    routeMocks.verifyAction.mockRejectedValue(new Error("verification unavailable"));
    const { POST } = await import("@/app/api/actions/execute/route");

    const response = await POST(actionRequest({
      agentId: "agent_test",
      action: "browse_web",
      resource: "web",
      input: { url: "https://example.com/" }
    }));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      allowed: false,
      decision: "denied",
      reason: "Verification failed closed.",
      executed: false
    });
    expect(routeMocks.fetchPublicWebRead).not.toHaveBeenCalled();
  });

  it("turns unsupported actions into denied verification decisions", async () => {
    const { POST } = await import("@/app/api/actions/execute/route");

    await POST(actionRequest({
      agentId: "agent_test",
      action: "delete_server",
      resource: "web",
      input: { url: "https://example.com/" }
    }));

    expect(routeMocks.verifyAction).toHaveBeenCalledWith(expect.objectContaining({
      enforcementDenyReason: "Action Gateway MVP only supports browse_web on the web resource."
    }));
  });
});
