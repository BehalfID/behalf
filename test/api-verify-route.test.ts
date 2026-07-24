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
vi.mock("@/lib/verify", () => ({
  verifyAction: routeMocks.verifyAction,
  POLICY_CONTEXT_MAX_BYTES: 16 * 1024
}));
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
      approvalRequired: false,
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
    await expect(missing.json()).resolves.toMatchObject({
      error: "Missing or invalid API key.",
      code: "AGENT_AUTH_REQUIRED"
    });
    expect(routeMocks.verifyAction).not.toHaveBeenCalled();
    expect(routeMocks.emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns AGENT_NOT_FOUND with 404 for unknown agents", async () => {
    routeMocks.authenticateAgent.mockResolvedValue({
      agent: null,
      error: "Unknown agent."
    });
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest({ agentId: "agent_missing", action: "purchase" }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unknown agent.",
      code: "AGENT_NOT_FOUND"
    });
    expect(routeMocks.verifyAction).not.toHaveBeenCalled();
  });

  it("returns INVALID_DEVELOPER_TOKEN when developer token auth fails", async () => {
    routeMocks.authenticateDeveloperToken.mockResolvedValue({
      tokenDoc: null,
      error: "Invalid developer token."
    });
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest({ agentId: "agent_test", action: "purchase" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid developer token.",
      code: "INVALID_DEVELOPER_TOKEN"
    });
    expect(routeMocks.verifyAction).not.toHaveBeenCalled();
  });

  it("returns a denied decision, queues a denied webhook, and omits raw secrets", async () => {
    routeMocks.verifyAction.mockResolvedValue({
      requestId: "req_denied",
      permissionId: null,
      allowed: false,
      approvalRequired: false,
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
      approvalRequired: false,
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

  it("passes the agent accountId to quota enforcement and blocks fail-closed missing-account denials", async () => {
    // Regression for issue #77: an agent without account context (e.g. a legacy
    // agent that predates account backfill) must not verify unmetered. The quota
    // helper fails closed and the route must honor that denial.
    routeMocks.authenticateAgent.mockResolvedValue({
      agent: agentFixture({ accountId: undefined }),
      error: null
    });
    routeMocks.checkAndIncrementVerifications.mockResolvedValue({
      allowed: false,
      code: "ACCOUNT_CONTEXT_MISSING",
      reason: "Account context is missing for this request, so quota cannot be enforced."
    });
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(verifyRequest({ agentId: "agent_test", action: "purchase" }));
    const json = await response.json();

    expect(routeMocks.checkAndIncrementVerifications).toHaveBeenCalledWith(undefined);
    expect(response.status).toBe(429);
    expect(json).toEqual(
      expect.objectContaining({
        error: "Account context is missing for this request, so quota cannot be enforced.",
        code: "ACCOUNT_CONTEXT_MISSING"
      })
    );
    expect(routeMocks.verifyAction).not.toHaveBeenCalled();
    expect(routeMocks.emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("accepts a valid policyContext object and passes it to verifyAction", async () => {
    const { POST } = await import("@/app/api/verify/route");
    const policyContext = {
      source: "claude_code",
      cwd: "/repo",
      toolInput: { filePath: "/repo/src/a.ts" }
    };

    const response = await POST(
      verifyRequest({
        agentId: "agent_test",
        action: "write_file",
        vendor: "filesystem",
        metadata: { note: "keep-me" },
        policyContext
      })
    );

    expect(response.status).toBe(200);
    expect(routeMocks.verifyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "write_file",
        metadata: { note: "keep-me" },
        policyContext
      })
    );
    // policyContext must not be substituted into metadata
    const arg = routeMocks.verifyAction.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.metadata).toEqual({ note: "keep-me" });
    expect(arg.metadata).not.toEqual(expect.objectContaining({ toolInput: expect.anything() }));
  });

  it("rejects a non-object policyContext", async () => {
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(
      verifyRequest({
        agentId: "agent_test",
        action: "write_file",
        policyContext: "not-an-object"
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: "policyContext must be an object." });
    expect(routeMocks.verifyAction).not.toHaveBeenCalled();
  });

  it("rejects an oversized policyContext", async () => {
    const { POST } = await import("@/app/api/verify/route");
    const { POLICY_CONTEXT_MAX_BYTES } = await import("@/lib/verify");

    const response = await POST(
      verifyRequest({
        agentId: "agent_test",
        action: "write_file",
        policyContext: {
          source: "claude_code",
          toolInput: { filePath: "/x/" + "a".repeat(POLICY_CONTEXT_MAX_BYTES) }
        }
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/policyContext must be an object under/);
    expect(routeMocks.verifyAction).not.toHaveBeenCalled();
  });

  it("still rejects unknown fields when policyContext is present", async () => {
    const { POST } = await import("@/app/api/verify/route");

    const response = await POST(
      verifyRequest({
        agentId: "agent_test",
        action: "write_file",
        policyContext: { toolInput: { filePath: "/a.ts" } },
        notARealField: true
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/Unknown field/);
    expect(routeMocks.verifyAction).not.toHaveBeenCalled();
  });
});
