import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentFixture, rawApiKey } from "./fixtures";

const keyMocks = vi.hoisted(() => ({
  authenticateAgent: vi.fn(),
  checkRateLimit: vi.fn(),
  connectToDatabase: vi.fn(),
  createApiKey: vi.fn(),
  agentFindOne: vi.fn(),
  agentUpdateOne: vi.fn(),
  createWebhookEvent: vi.fn(),
  emitWebhookEvent: vi.fn()
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authenticateAgent: keyMocks.authenticateAgent
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: keyMocks.checkRateLimit,
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));
vi.mock("@/lib/db", () => ({ connectToDatabase: keyMocks.connectToDatabase }));
vi.mock("@/lib/ids", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ids")>()),
  createApiKey: keyMocks.createApiKey
}));
vi.mock("@/models/Agent", () => ({
  default: {
    findOne: keyMocks.agentFindOne,
    updateOne: keyMocks.agentUpdateOne
  }
}));
vi.mock("@/lib/webhooks", () => ({
  createWebhookEvent: keyMocks.createWebhookEvent,
  emitWebhookEvent: keyMocks.emitWebhookEvent
}));

function bearerRequest(apiKey = rawApiKey) {
  return new Request("http://localhost/api/agents/agent_test/rotate-key", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` }
  }) as never;
}

function authRequest(authorization?: string) {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: authorization === undefined ? {} : { authorization }
  }) as never;
}

describe("API key handling", () => {
  beforeEach(() => {
    keyMocks.authenticateAgent.mockResolvedValue({ agent: agentFixture(), error: null });
    keyMocks.checkRateLimit.mockResolvedValue({ limited: false });
    keyMocks.connectToDatabase.mockResolvedValue(undefined);
    keyMocks.createApiKey.mockReturnValue("bhf_sk_rotated_secret");
    keyMocks.agentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    keyMocks.createWebhookEvent.mockReturnValue({ eventId: "evt_key_rotated" });
    keyMocks.emitWebhookEvent.mockResolvedValue(undefined);
  });

  it("hashes API keys instead of storing raw secrets", async () => {
    const { hashApiKey } = await import("@/lib/auth");

    const hash = hashApiKey(rawApiKey);

    expect(hash).not.toBe(rawApiKey);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("authenticates only matching hashed API keys", async () => {
    const { authenticateAgent, hashApiKey } = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
    const storedAgent = agentFixture({ apiKeyHash: hashApiKey(rawApiKey) });
    keyMocks.agentFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(storedAgent)
    });

    await expect(authenticateAgent(bearerRequest(rawApiKey), "agent_test")).resolves.toEqual({
      agent: storedAgent,
      error: null
    });
    await expect(authenticateAgent(bearerRequest("bhf_sk_wrong"), "agent_test")).resolves.toEqual({
      agent: null,
      error: "API key does not match this agent."
    });
    expect(keyMocks.agentUpdateOne).toHaveBeenCalledWith(
      { agentId: "agent_test", apiKeyHash: hashApiKey(rawApiKey) },
      { $set: { lastUsedAt: expect.any(Date) } }
    );
  });

  it("rejects missing or malformed bearer token formats before hash lookup", async () => {
    const { authenticateAgent } = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");

    for (const authorization of [
      undefined,
      "",
      "Bearer",
      "Basic bhf_sk_test_abcdefghijklmnopqrstuvwxyz123456",
      "Bearer not-valid",
      "Bearer bhf_pk_test_abcdefghijklmnopqrstuvwxyz123456",
      "Bearer bhf_sk_test_abcdefghijklmnopqrstuvwxyz123456 extra"
    ]) {
      await expect(authenticateAgent(authRequest(authorization), "agent_test")).resolves.toEqual({
        agent: null,
        error: "Missing or invalid API key."
      });
    }

    expect(keyMocks.agentFindOne).not.toHaveBeenCalled();
    expect(keyMocks.agentUpdateOne).not.toHaveBeenCalled();
  });

  it("does not update lastUsedAt for a valid-looking but wrong API key", async () => {
    const { authenticateAgent } = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
    keyMocks.agentFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(agentFixture())
    });

    await expect(authenticateAgent(authRequest("Bearer bhf_sk_wrong_abcdefghijklmnopqrstuvwxyz123456"), "agent_test")).resolves.toEqual({
      agent: null,
      error: "API key does not match this agent."
    });

    expect(keyMocks.agentUpdateOne).not.toHaveBeenCalled();
  });

  it("does not update lastUsedAt when an old rotated key is presented", async () => {
    const { authenticateAgent, hashApiKey } = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
    keyMocks.agentFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(agentFixture({
        apiKeyHash: hashApiKey("bhf_sk_current_abcdefghijklmnopqrstuvwxyz123456")
      }))
    });

    await expect(authenticateAgent(authRequest(`Bearer ${rawApiKey}`), "agent_test")).resolves.toEqual({
      agent: null,
      error: "API key does not match this agent."
    });

    expect(keyMocks.agentUpdateOne).not.toHaveBeenCalled();
  });

  it("passes valid-looking bearer token formats to hashed key lookup", async () => {
    const { authenticateAgent, hashApiKey } = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
    const storedAgent = agentFixture({ apiKeyHash: hashApiKey(rawApiKey) });
    keyMocks.agentFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(storedAgent)
    });

    await expect(authenticateAgent(authRequest(`Bearer ${rawApiKey}`), "agent_test")).resolves.toEqual({
      agent: storedAgent,
      error: null
    });

    expect(keyMocks.agentFindOne).toHaveBeenCalledWith({ agentId: "agent_test" });
  });

  it("rotating a public agent key stores only the new hash and returns the raw key once", async () => {
    const { POST } = await import("@/app/api/agents/[agentId]/rotate-key/route");
    const { hashApiKey } = await import("@/lib/auth");

    const response = await POST(bearerRequest(), {
      params: Promise.resolve({ agentId: "agent_test" })
    });
    const json = await response.json();

    expect(json).toEqual({ agentId: "agent_test", apiKey: "bhf_sk_rotated_secret" });
    expect(keyMocks.agentUpdateOne).toHaveBeenCalledWith(
      { agentId: "agent_test", apiKeyHash: hashApiKey(rawApiKey) },
      {
        $set: { apiKeyHash: hashApiKey("bhf_sk_rotated_secret"), keyRotatedAt: expect.any(Date) },
        $unset: { lastUsedAt: "" }
      }
    );
    expect(JSON.stringify(keyMocks.agentUpdateOne.mock.calls)).not.toContain("bhf_sk_rotated_secret");
  });

  it("returns a conflict if the old key hash no longer matches during rotation", async () => {
    keyMocks.agentUpdateOne.mockResolvedValue({ matchedCount: 0 });
    const { POST } = await import("@/app/api/agents/[agentId]/rotate-key/route");

    const response = await POST(bearerRequest(), {
      params: Promise.resolve({ agentId: "agent_test" })
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({ error: "API key has already been rotated." });
  });
});
