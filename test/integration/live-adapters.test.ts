/**
 * Live integration tests for the BehalfID adapter wrappers.
 *
 * Each adapter test:
 *  - uses real BEHALFID_BASE_URL / BEHALFID_API_KEY / BEHALFID_AGENT_ID
 *  - calls the real /api/verify endpoint
 *  - confirms that denied actions do NOT invoke the execute callback
 *  - skips allowed-path tests unless the seeded permission exists
 *
 * Opt-in: tests are skipped unless RUN_LIVE_TESTS=true is set.
 *
 * Allowed-path setup:
 *   Run `npm run seed:live-test` before running live tests to ensure the
 *   test permission (action: "send", resource: "communication.email") exists.
 *   The seed script uses the agent API key and creates a 1-hour expiry permission.
 *
 * Run:
 *   npm run seed:live-test
 *   RUN_LIVE_TESTS=true npm run test:live
 *
 * Vendor SDK smoke tests (OpenAI / Anthropic / Stripe) run only if the
 * corresponding API key is set AND the vendor package is already installed.
 * No vendor packages are added as dependencies here.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { loadLocalEnv } from "../helpers/load-local-env";
import { ensureLiveTestPermission, ALLOWED_ACTION, ALLOWED_RESOURCE } from "../helpers/live-test-setup";

loadLocalEnv();

import type { IntegrationConfig, BehalfIDClient } from "../../integrations/shared/index";
import { checkToolCall, checkPurchase, checkWebBrowse } from "../../integrations/openai/index";
import { checkToolUse, buildDeniedToolResult } from "../../integrations/anthropic/index";
import { wrapToolWithBehalfID, wrapToolsWithBehalfID } from "../../integrations/langchain/index";
import { gateCheckoutSession, gateCharge } from "../../integrations/stripe/index";

// ─── Opt-in guard ─────────────────────────────────────────────────────────────

const REQUIRED = ["BEHALFID_BASE_URL", "BEHALFID_API_KEY", "BEHALFID_AGENT_ID"] as const;

function shouldSkip(): { skip: boolean; reason: string } {
  if (process.env.RUN_LIVE_TESTS !== "true") {
    return { skip: true, reason: "RUN_LIVE_TESTS is not 'true'" };
  }
  const missing = REQUIRED.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    return { skip: true, reason: `Missing env vars: ${missing.join(", ")}` };
  }
  return { skip: false, reason: "" };
}

// ─── Real BehalfID client ─────────────────────────────────────────────────────

function makeRealClient(): BehalfIDClient {
  const baseUrl = process.env.BEHALFID_BASE_URL!.replace(/\/+$/, "");
  const apiKey = process.env.BEHALFID_API_KEY!;

  return {
    async verify(input) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(input),
        });
      } catch {
        return { requestId: "req_network_error", allowed: false, reason: "Network error.", risk: "high" };
      }
      if (!res.ok) {
        return { requestId: "req_http_error", allowed: false, reason: `HTTP ${res.status}`, risk: "high" };
      }
      return res.json() as Promise<{ requestId: string; allowed: boolean; reason: string; risk: "low" | "medium" | "high" }>;
    },
  };
}

function makeConfig(): IntegrationConfig {
  return { client: makeRealClient(), agentId: process.env.BEHALFID_AGENT_ID! };
}

// Allowed-path state — set in beforeAll across all suites
let canRunAllowedTests = false;
let allowedSkipReason = "";

beforeAll(async () => {
  const { skip, reason } = shouldSkip();
  if (skip) { allowedSkipReason = reason; return; }

  const setup = await ensureLiveTestPermission();
  canRunAllowedTests = setup.canRunAllowedTests;
  if (!setup.canRunAllowedTests) {
    allowedSkipReason = setup.reason ?? "Permission not available";
    console.log(`[live-adapters] allowed-path tests SKIP — ${allowedSkipReason}`);
  } else {
    console.log(`[live-adapters] Allowed-path permission confirmed`);
    if (setup.seededPermissionId) {
      console.log(`[live-adapters] Seeded: ${setup.seededPermissionId} (expires 1h)`);
    }
  }
});

// ─── OpenAI adapter ───────────────────────────────────────────────────────────

describe("live: OpenAI adapter — denied paths", () => {
  it("checkToolCall: denies high-value purchase, execute not called", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/openai] SKIP — ${reason}`); return; }

    const execute = vi.fn().mockResolvedValue({ ok: true });
    const result = await checkToolCall(
      makeConfig(),
      { name: "purchase", arguments: { vendor: "acme.example.com", amount: 999999 } },
      execute,
      { resource: "commerce.checkout", amount: 999999 }
    );

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log(`[live/openai] denied purchase (requestId=${result.requestId})`);
  });

  it("checkPurchase: denies oversized amount, execute not called", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/openai] SKIP — ${reason}`); return; }

    const execute = vi.fn().mockResolvedValue({ charged: true });
    const result = await checkPurchase(makeConfig(), { vendor: "evil.example", amount: 999999, execute });

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log(`[live/openai] checkPurchase denied (requestId=${result.requestId})`);
  });
});

describe("live: OpenAI adapter — allowed paths", () => {
  it("checkToolCall: execute is called once and result is returned", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/openai/allow] SKIP — ${reason}`); return; }
    if (!canRunAllowedTests) { console.log(`[live/openai/allow] SKIP — ${allowedSkipReason}`); return; }

    const execute = vi.fn().mockResolvedValue({ emailSent: true });
    const result = await checkToolCall(
      makeConfig(),
      { name: ALLOWED_ACTION, arguments: { to: "test@example.com" } },
      execute,
      { resource: ALLOWED_RESOURCE }
    );

    expect(result.blocked).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
    expect((result as { result: unknown }).result).toEqual({ emailSent: true });
    console.log(`[live/openai/allow] allowed send (requestId=${result.requestId})`);
  });

  it("checkWebBrowse: behaves correctly based on permission state", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/openai/allow] SKIP — ${reason}`); return; }

    // browse_web is NOT the seeded permission — this either passes or denies
    // depending on whether the agent has a browse_web permission. The test
    // validates the response shape regardless.
    const execute = vi.fn().mockResolvedValue("page content");
    const result = await checkWebBrowse(makeConfig(), "https://example.com", execute);

    if (result.blocked) {
      expect(execute).not.toHaveBeenCalled();
      console.log(`[live/openai/allow] browse_web denied (no permission) — correct`);
    } else {
      expect(execute).toHaveBeenCalled();
      console.log(`[live/openai/allow] browse_web allowed (permission exists) — correct`);
    }
  });
});

// ─── Anthropic adapter ────────────────────────────────────────────────────────

describe("live: Anthropic adapter — denied paths", () => {
  it("denies unauthorized tool_use, execute not called", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/anthropic] SKIP — ${reason}`); return; }

    const execute = vi.fn().mockResolvedValue({ status: "done" });
    const toolBlock = { id: "toolu_live_deny", name: "purchase", input: { vendor: "evil.example", amount: 999999 } };
    const result = await checkToolUse(makeConfig(), toolBlock, execute, { resource: "commerce.checkout", amount: 999999 });

    expect(result.blocked).toBe(true);
    expect(result.tool_use_id).toBe(toolBlock.id);
    expect(execute).not.toHaveBeenCalled();

    const toolResult = buildDeniedToolResult(result.tool_use_id, result.reason);
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.tool_use_id).toBe(toolBlock.id);
    console.log(`[live/anthropic] denied tool_use (tool_use_id=${result.tool_use_id})`);
  });
});

describe("live: Anthropic adapter — allowed paths", () => {
  it("checkToolUse: execute called once, result returned, tool_use_id echoed", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/anthropic/allow] SKIP — ${reason}`); return; }
    if (!canRunAllowedTests) { console.log(`[live/anthropic/allow] SKIP — ${allowedSkipReason}`); return; }

    const execute = vi.fn().mockResolvedValue({ delivered: true });
    const toolBlock = { id: "toolu_live_allow", name: ALLOWED_ACTION, input: { to: "user@example.com" } };
    const result = await checkToolUse(makeConfig(), toolBlock, execute, { resource: ALLOWED_RESOURCE });

    expect(result.blocked).toBe(false);
    expect(result.tool_use_id).toBe(toolBlock.id);
    expect(execute).toHaveBeenCalledOnce();
    expect((result as { result: unknown }).result).toEqual({ delivered: true });
    console.log(`[live/anthropic/allow] allowed tool_use (requestId=${result.requestId})`);
  });
});

// ─── LangChain adapter ────────────────────────────────────────────────────────

describe("live: LangChain adapter — denied paths", () => {
  it("wrapped tool: denied action does not invoke original call()", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/langchain] SKIP — ${reason}`); return; }

    const originalCall = vi.fn().mockResolvedValue("output");
    const wrapped = wrapToolWithBehalfID(
      makeConfig(),
      { name: "purchase", description: "Make a purchase", call: originalCall },
      { resource: "commerce.checkout", amount: 999999 }
    );

    const result = await wrapped.call("buy 999999 units");
    expect((result as { blocked: boolean }).blocked).toBe(true);
    expect(originalCall).not.toHaveBeenCalled();
    console.log(`[live/langchain] wrapped tool denied`);
  });

  it("wrapToolsWithBehalfID: all denied actions skip execute", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/langchain] SKIP — ${reason}`); return; }

    const callA = vi.fn().mockResolvedValue("a");
    const callB = vi.fn().mockResolvedValue("b");
    const tools = [
      { name: "purchase", description: "buy", call: callA },
      { name: "purchase", description: "buy more", call: callB },
    ];
    const wrapped = wrapToolsWithBehalfID(makeConfig(), tools, { resource: "commerce.checkout", amount: 999999 });

    for (const tool of wrapped) {
      const r = await tool.call("input");
      expect((r as { blocked: boolean }).blocked).toBe(true);
    }
    expect(callA).not.toHaveBeenCalled();
    expect(callB).not.toHaveBeenCalled();
    console.log(`[live/langchain] all wrapped tools denied`);
  });
});

describe("live: LangChain adapter — allowed paths", () => {
  it("wrapped tool: execute called once and result returned", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/langchain/allow] SKIP — ${reason}`); return; }
    if (!canRunAllowedTests) { console.log(`[live/langchain/allow] SKIP — ${allowedSkipReason}`); return; }

    const originalCall = vi.fn().mockResolvedValue("email sent");
    const wrapped = wrapToolWithBehalfID(
      makeConfig(),
      { name: ALLOWED_ACTION, description: "Send a message", call: originalCall },
      { resource: ALLOWED_RESOURCE }
    );

    const result = await wrapped.call("to: user@example.com");
    expect(result).toBe("email sent");
    expect(originalCall).toHaveBeenCalledOnce();
    console.log(`[live/langchain/allow] wrapped tool allowed, execute ran`);
  });
});

// ─── Stripe adapter ───────────────────────────────────────────────────────────

describe("live: Stripe adapter — denied paths", () => {
  it("gateCheckoutSession: denies high-value checkout, execute not called", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/stripe] SKIP — ${reason}`); return; }

    const execute = vi.fn().mockResolvedValue({ session: { id: "cs_fake" } });
    const result = await gateCheckoutSession(makeConfig(), { amountTotal: 999999, customerId: "cus_test", execute });

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log(`[live/stripe] gateCheckoutSession denied (requestId=${result.requestId})`);
  });

  it("gateCharge: denies high-value charge, execute not called", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/stripe] SKIP — ${reason}`); return; }

    const execute = vi.fn().mockResolvedValue({ charge: { id: "ch_fake" } });
    const result = await gateCharge(makeConfig(), { amount: 999999, execute });

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log(`[live/stripe] gateCharge denied (requestId=${result.requestId})`);
  });
});

// ─── timeout: fail-closed on slow verify ─────────────────────────────────────

describe("live: timeoutMs — fail-closed on slow verify", () => {
  it("denies action when verify times out (1ms)", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/timeout] SKIP — ${reason}`); return; }

    const config: IntegrationConfig = { ...makeConfig(), timeoutMs: 1 };
    const execute = vi.fn().mockResolvedValue("should not run");

    const result = await checkToolCall(
      config,
      { name: "purchase", arguments: { amount: 100 } },
      execute,
      { resource: "commerce.checkout", amount: 100 }
    );

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log(`[live/timeout] timeoutMs=1 → blocked (correct)`);
  });
});

// ─── Vendor SDK smoke tests ───────────────────────────────────────────────────

describe("live: OpenAI vendor SDK smoke test", () => {
  it("skips if OPENAI_API_KEY absent or openai not installed", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/openai-sdk] SKIP — ${reason}`); return; }
    if (!process.env.OPENAI_API_KEY) { console.log("[live/openai-sdk] SKIP — OPENAI_API_KEY not set"); return; }

    let available = false;
    try { await import("openai"); available = true; } catch { console.log("[live/openai-sdk] SKIP — openai not installed"); }
    if (!available) return;

    const execute = vi.fn().mockRejectedValue(new Error("OpenAI must not be called"));
    const result = await checkToolCall(
      makeConfig(),
      { name: "purchase", arguments: { vendor: "test", amount: 999999 } },
      execute,
      { resource: "commerce.checkout", amount: 999999 }
    );

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log("[live/openai-sdk] BehalfID gate blocked before OpenAI call (correct)");
  });
});

describe("live: Anthropic vendor SDK smoke test", () => {
  it("skips if ANTHROPIC_API_KEY absent or @anthropic-ai/sdk not installed", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/anthropic-sdk] SKIP — ${reason}`); return; }
    if (!process.env.ANTHROPIC_API_KEY) { console.log("[live/anthropic-sdk] SKIP — ANTHROPIC_API_KEY not set"); return; }

    let available = false;
    try { await import("@anthropic-ai/sdk"); available = true; } catch { console.log("[live/anthropic-sdk] SKIP — @anthropic-ai/sdk not installed"); }
    if (!available) return;

    const execute = vi.fn().mockRejectedValue(new Error("Anthropic must not be called"));
    const result = await checkToolUse(
      makeConfig(),
      { id: "toolu_smoke", name: "purchase", input: { amount: 999999 } },
      execute,
      { resource: "commerce.checkout", amount: 999999 }
    );

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log("[live/anthropic-sdk] BehalfID gate blocked before Anthropic call (correct)");
  });
});

describe("live: Stripe vendor SDK smoke test", () => {
  it("confirms BehalfID denies before Stripe is called", async () => {
    const { skip, reason } = shouldSkip();
    if (skip) { console.log(`[live/stripe-sdk] SKIP — ${reason}`); return; }
    if (!process.env.STRIPE_SECRET_KEY) { console.log("[live/stripe-sdk] SKIP — STRIPE_SECRET_KEY not set"); return; }

    // stripe is a root dependency — confirm gate fires before execute
    const execute = vi.fn().mockRejectedValue(new Error("Stripe must not be called"));
    const result = await gateCheckoutSession(makeConfig(), { amountTotal: 999999, execute });

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log("[live/stripe-sdk] BehalfID gate blocked before Stripe call (correct)");
  });
});
