/**
 * Unit tests for the BehalfID Vercel adapter (processBehalfIDRequest).
 *
 * Uses `processBehalfIDRequest` — the framework-agnostic core extracted from
 * `createBehalfIDHandler`. Tests use standard Web API Request/Response objects
 * with a mocked global fetch, so no Next.js runtime is required.
 *
 * No network calls are made.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { processBehalfIDRequest } from "../integrations/vercel/index";
import type { BehalfIDRouteConfig } from "../integrations/vercel/index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONFIG: BehalfIDRouteConfig = {
  apiKey: "bhf_sk_test_vercel_unit_key",
  agentId: "agent_vercel_test",
  baseUrl: "https://behalfid.example.com",
};

function makeRequest(body: unknown): Pick<Request, "json"> {
  return {
    json: () => Promise.resolve(body),
  };
}

function makeRequestThrows(): Pick<Request, "json"> {
  return {
    json: () => Promise.reject(new SyntaxError("Unexpected token")),
  };
}

type JsonBody = Record<string, unknown>;

async function body(response: Response): Promise<JsonBody> {
  return (await response.json()) as JsonBody;
}

function mockFetchAllowed(requestId = "req_allowed") {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        requestId,
        allowed: true,
        reason: "Action allowed by active permission.",
        risk: "low",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );
}

function mockFetchDenied(requestId = "req_denied") {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        requestId,
        allowed: false,
        reason: "No active permission exists for this action.",
        risk: "high",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );
}

function mockFetchError() {
  vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network failure"));
}

function mockFetchHttpError(status: number) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response("Unauthorized", { status })
  );
}

// ─── Configuration errors ─────────────────────────────────────────────────────

describe("vercel adapter: configuration errors", () => {
  it("returns 503 when apiKey is missing", async () => {
    const req = makeRequest({ action: "send" });
    const res = await processBehalfIDRequest(req, { agentId: "agent_test" });
    expect(res.status).toBe(503);
    const data = await body(res);
    expect(typeof data.error).toBe("string");
  });

  it("returns 503 when agentId is missing", async () => {
    const req = makeRequest({ action: "send" });
    const res = await processBehalfIDRequest(req, { apiKey: "bhf_sk_test_key" });
    expect(res.status).toBe(503);
  });

  it("falls back to process.env.BEHALFID_API_KEY and BEHALFID_AGENT_ID", async () => {
    vi.stubEnv("BEHALFID_API_KEY", "bhf_sk_env_key");
    vi.stubEnv("BEHALFID_AGENT_ID", "agent_env");
    vi.stubEnv("BEHALFID_BASE_URL", "https://env.example.com");
    mockFetchDenied();

    const req = makeRequest({ action: "purchase" });
    const res = await processBehalfIDRequest(req, {});
    expect(res.status).toBe(403);
  });
});

// ─── Request body parsing ─────────────────────────────────────────────────────

describe("vercel adapter: request body parsing", () => {
  it("returns 400 when body is not valid JSON", async () => {
    const req = makeRequestThrows();
    const res = await processBehalfIDRequest(req, CONFIG);
    expect(res.status).toBe(400);
    const data = await body(res);
    expect(data.error).toBe("Invalid JSON body.");
  });

  it("returns 400 when action is missing from body", async () => {
    const req = makeRequest({ amount: 100 });
    const res = await processBehalfIDRequest(req, CONFIG);
    expect(res.status).toBe(400);
    const data = await body(res);
    expect(typeof data.error).toBe("string");
    expect(data.error as string).toContain("action");
  });

  it("returns 400 when action is empty string", async () => {
    const req = makeRequest({ action: "" });
    const res = await processBehalfIDRequest(req, CONFIG);
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is not a string", async () => {
    const req = makeRequest({ action: 42 });
    const res = await processBehalfIDRequest(req, CONFIG);
    expect(res.status).toBe(400);
  });
});

// ─── Denied action ────────────────────────────────────────────────────────────

describe("vercel adapter: denied action", () => {
  it("returns 403 when BehalfID denies the action", async () => {
    mockFetchDenied("req_vercel_deny");

    const req = makeRequest({ action: "purchase", amount: 999999 });
    const res = await processBehalfIDRequest(req, CONFIG);

    expect(res.status).toBe(403);
    const data = await body(res);
    expect(data.allowed).toBe(false);
    expect(data.requestId).toBe("req_vercel_deny");
    expect(typeof data.reason).toBe("string");
    expect(typeof data.risk).toBe("string");
  });

  it("does not call onAllowed when action is denied", async () => {
    mockFetchDenied();
    const onAllowed = vi.fn();

    const req = makeRequest({ action: "purchase" });
    const res = await processBehalfIDRequest(req, { ...CONFIG, onAllowed });

    expect(res.status).toBe(403);
    expect(onAllowed).not.toHaveBeenCalled();
  });
});

// ─── Allowed action ───────────────────────────────────────────────────────────

describe("vercel adapter: allowed action", () => {
  it("returns 200 when BehalfID allows the action", async () => {
    mockFetchAllowed("req_vercel_allow");

    const req = makeRequest({ action: "send" });
    const res = await processBehalfIDRequest(req, CONFIG);

    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.allowed).toBe(true);
    expect(data.requestId).toBe("req_vercel_allow");
  });

  it("calls onAllowed with action, body, and verifyResult when allowed", async () => {
    mockFetchAllowed("req_custom");
    const onAllowed = vi.fn().mockResolvedValue(null);

    const req = makeRequest({ action: "send", resource: "email" });
    await processBehalfIDRequest(req, { ...CONFIG, onAllowed });

    expect(onAllowed).toHaveBeenCalledOnce();
    const [calledAction, calledBody, calledVerify] = onAllowed.mock.calls[0];
    expect(calledAction).toBe("send");
    expect(calledBody.action).toBe("send");
    expect(calledVerify.allowed).toBe(true);
    expect(calledVerify.requestId).toBe("req_custom");
  });

  it("returns custom onAllowed response when non-null", async () => {
    mockFetchAllowed();
    const customResponse = new Response(JSON.stringify({ custom: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
    const onAllowed = vi.fn().mockResolvedValue(customResponse);

    const req = makeRequest({ action: "send" });
    const res = await processBehalfIDRequest(req, { ...CONFIG, onAllowed });

    expect(res.status).toBe(201);
    const data = await body(res);
    expect(data.custom).toBe(true);
  });

  it("falls through to default 200 when onAllowed returns null", async () => {
    mockFetchAllowed("req_fallthrough");
    const onAllowed = vi.fn().mockResolvedValue(null);

    const req = makeRequest({ action: "send" });
    const res = await processBehalfIDRequest(req, { ...CONFIG, onAllowed });

    expect(res.status).toBe(200);
    const data = await body(res);
    expect(data.allowed).toBe(true);
  });
});

// ─── Fail-closed on verify errors ─────────────────────────────────────────────

describe("vercel adapter: fail-closed on verify errors", () => {
  it("returns 503 when fetch throws (network failure)", async () => {
    mockFetchError();

    const req = makeRequest({ action: "send" });
    const res = await processBehalfIDRequest(req, CONFIG);

    expect(res.status).toBe(503);
    const data = await body(res);
    expect(data.allowed).toBe(false);
    expect(typeof data.error).toBe("string");
    expect(typeof data.detail).toBe("string");
  });

  it("returns 503 when BehalfID verify endpoint returns 401", async () => {
    mockFetchHttpError(401);

    const req = makeRequest({ action: "send" });
    const res = await processBehalfIDRequest(req, CONFIG);

    expect(res.status).toBe(503);
    const data = await body(res);
    expect(data.allowed).toBe(false);
  });

  it("returns 503 when BehalfID verify endpoint returns 500", async () => {
    mockFetchHttpError(500);

    const req = makeRequest({ action: "send" });
    const res = await processBehalfIDRequest(req, CONFIG);

    expect(res.status).toBe(503);
  });

  it("does not call onAllowed when verify throws", async () => {
    mockFetchError();
    const onAllowed = vi.fn();

    const req = makeRequest({ action: "send" });
    const res = await processBehalfIDRequest(req, { ...CONFIG, onAllowed });

    expect(res.status).toBe(503);
    expect(onAllowed).not.toHaveBeenCalled();
  });
});

// ─── Optional body fields are forwarded ──────────────────────────────────────

describe("vercel adapter: optional body fields", () => {
  it("forwards amount, vendor, resource, metadata to verify", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ requestId: "req_fwd", allowed: false, reason: "denied", risk: "high" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const req = makeRequest({
      action: "purchase",
      amount: 100,
      vendor: "acme.com",
      resource: "product",
      metadata: { orderId: "ord_123" },
    });

    await processBehalfIDRequest(req, CONFIG);

    const fetchedBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string) as Record<string, unknown>;
    expect(fetchedBody.amount).toBe(100);
    expect(fetchedBody.vendor).toBe("acme.com");
    expect(fetchedBody.resource).toBe("product");
    expect((fetchedBody.metadata as Record<string, unknown>).orderId).toBe("ord_123");
  });

  it("ignores non-string vendor, non-number amount, non-object metadata", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ requestId: "req_coerce", allowed: false, reason: "denied", risk: "high" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const req = makeRequest({
      action: "send",
      amount: "not-a-number",
      vendor: 999,
      metadata: ["array"],
    });

    await processBehalfIDRequest(req, CONFIG);

    const fetchedBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string) as Record<string, unknown>;
    expect(fetchedBody.amount).toBeUndefined();
    expect(fetchedBody.vendor).toBeUndefined();
    expect(fetchedBody.metadata).toBeUndefined();
  });
});

// ─── createBehalfIDHandler wraps processBehalfIDRequest ──────────────────────

describe("vercel adapter: createBehalfIDHandler", () => {
  it("exports the factory and it returns a function", async () => {
    const { createBehalfIDHandler } = await import("../integrations/vercel/index");
    const handler = createBehalfIDHandler(CONFIG);
    expect(typeof handler).toBe("function");
  });
});
