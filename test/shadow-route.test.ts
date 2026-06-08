/**
 * Shadow mode — POST /api/verify route tests.
 * Verifies that shadow=true / mode="shadow" flows through the route correctly
 * and that normal denied responses are unaffected.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentFixture } from "./fixtures";

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
  quotaErrorDetails: () => ({})
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

function verifyRequest(body: unknown) {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer bhf_sk_test" },
    body: JSON.stringify(body)
  }) as never;
}

const shadowDeniedDecision = {
  requestId: "req_shadow",
  permissionId: null,
  allowed: true,
  approvalRequired: false,
  approvalId: null,
  shadow: true,
  shadowDecision: { allowed: false, reason: "No active permission exists for this action.", risk: "high" },
  reason: "Shadow mode: action would have been denied.",
  risk: "high"
};

describe("POST /api/verify route — shadow mode", () => {
  beforeEach(() => {
    routeMocks.connectToDatabase.mockResolvedValue(undefined);
    routeMocks.authenticateAgent.mockResolvedValue({ agent: agentFixture(), error: null });
    routeMocks.authenticateDeveloperToken.mockResolvedValue({ tokenDoc: null, error: null });
    routeMocks.checkAndIncrementVerifications.mockResolvedValue({ allowed: true });
    routeMocks.checkRateLimit.mockResolvedValue({ limited: false });
    routeMocks.createWebhookEvent.mockReturnValue({ eventId: "evt_shadow" });
    routeMocks.emitWebhookEvent.mockResolvedValue(undefined);
  });

  it("passes shadow=true to verifyAction when body.shadow is true", async () => {
    routeMocks.verifyAction.mockResolvedValue(shadowDeniedDecision);
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest({ agentId: "agent_test", action: "deploy", shadow: true }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.allowed).toBe(true);
    expect(json.shadow).toBe(true);
    expect(json.shadowDecision).toEqual({
      allowed: false,
      reason: "No active permission exists for this action.",
      risk: "high"
    });
    expect(routeMocks.verifyAction).toHaveBeenCalledWith(
      expect.objectContaining({ shadow: true })
    );
  });

  it("passes shadow=true to verifyAction when body.mode is 'shadow'", async () => {
    routeMocks.verifyAction.mockResolvedValue({
      ...shadowDeniedDecision,
      requestId: "req_shadow2",
      shadowDecision: { allowed: true, reason: "Action allowed.", risk: "low" },
      reason: "Shadow mode: action would have been allowed."
    });
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest({ agentId: "agent_test", action: "purchase", mode: "shadow" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.shadow).toBe(true);
    expect(routeMocks.verifyAction).toHaveBeenCalledWith(
      expect.objectContaining({ shadow: true })
    );
  });

  it("emits verification.shadow webhook event for shadow requests", async () => {
    routeMocks.verifyAction.mockResolvedValue(shadowDeniedDecision);
    const { POST } = await import("@/app/api/verify/route");

    await POST(verifyRequest({ agentId: "agent_test", action: "deploy", shadow: true }));

    expect(routeMocks.createWebhookEvent).toHaveBeenCalledWith(
      "acct_test",
      "verification.shadow",
      expect.objectContaining({ shadow: true, shadowDecision: shadowDeniedDecision.shadowDecision }),
      "dev_test"
    );
  });

  it("does not include shadow fields in normal-mode responses", async () => {
    routeMocks.verifyAction.mockResolvedValue({
      requestId: "req_normal",
      permissionId: "perm_test",
      allowed: true,
      approvalRequired: false,
      approvalId: null,
      reason: "Action allowed by active permission.",
      risk: "low"
    });
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest({ agentId: "agent_test", action: "purchase" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.shadow).toBeUndefined();
    expect(json.shadowDecision).toBeUndefined();
  });

  it("normal denied actions are still blocked in normal mode (allowed=false returned)", async () => {
    routeMocks.verifyAction.mockResolvedValue({
      requestId: "req_denied",
      permissionId: null,
      allowed: false,
      approvalRequired: false,
      approvalId: null,
      reason: "No active permission exists for this action.",
      risk: "high"
    });
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest({ agentId: "agent_test", action: "deploy" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.allowed).toBe(false);
    expect(json.shadow).toBeUndefined();
  });

  it("emits verification.denied webhook for normal denied actions", async () => {
    routeMocks.verifyAction.mockResolvedValue({
      requestId: "req_denied",
      permissionId: null,
      allowed: false,
      approvalRequired: false,
      approvalId: null,
      reason: "No active permission exists for this action.",
      risk: "high"
    });
    const { POST } = await import("@/app/api/verify/route");

    await POST(verifyRequest({ agentId: "agent_test", action: "deploy" }));

    expect(routeMocks.createWebhookEvent).toHaveBeenCalledWith(
      expect.any(String),
      "verification.denied",
      expect.any(Object),
      expect.any(String)
    );
  });
});
