import { describe, expect, it } from "vitest";
import { createHttpVerifyClient } from "../src/httpVerifyClient.js";

describe("createHttpVerifyClient", () => {
  it("POSTs the verify payload with a bearer token", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = createHttpVerifyClient({
      verifyUrl: "https://behalfid.test/api/verify",
      apiKey: "bhf_sk_test",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            requestId: "req_1",
            allowed: true,
            reason: "ok",
            risk: "low",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const decision = await client.verify({
      agentId: "agent_1",
      action: "mcp_tool",
    });

    expect(decision.allowed).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://behalfid.test/api/verify");
    expect(calls[0]?.init.method).toBe("POST");
    expect(
      (calls[0]?.init.headers as Record<string, string>).authorization,
    ).toBe("Bearer bhf_sk_test");
  });

  it("fails closed on non-OK HTTP responses", async () => {
    const client = createHttpVerifyClient({
      verifyUrl: "https://behalfid.test/api/verify",
      apiKey: "k",
      fetchImpl: async () =>
        new Response("upstream unavailable", { status: 503 }),
    });

    await expect(
      client.verify({ agentId: "a", action: "mcp_tool" }),
    ).rejects.toThrow(/Verify HTTP 503/);
  });

  it("normalizes a missing risk field to high rather than failing open", async () => {
    const client = createHttpVerifyClient({
      verifyUrl: "https://behalfid.test/api/verify",
      apiKey: "k",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            requestId: "req_1",
            allowed: false,
            reason: "blocked",
          }),
          { status: 200 },
        ),
    });

    const decision = await client.verify({
      agentId: "a",
      action: "mcp_tool",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.risk).toBe("high");
  });

  it("rejects an unrecoverable payload shape", async () => {
    const client = createHttpVerifyClient({
      verifyUrl: "https://behalfid.test/api/verify",
      apiKey: "k",
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });

    await expect(
      client.verify({ agentId: "a", action: "mcp_tool" }),
    ).rejects.toThrow(/Malformed verification response/);
  });
});
