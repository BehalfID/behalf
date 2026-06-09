/**
 * Tests for BehalfID integration adapters.
 *
 * All BehalfID API calls are mocked — no network or database calls.
 * Covers: shared utilities, OpenAI, Anthropic, LangChain, LlamaIndex, Stripe.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BehalfIDClient, IntegrationConfig, VerifyResult } from "../integrations/shared/index";
import {
  makeDenyResponse,
  requireEnvVars,
  mapToVerifyInput,
  withAuditMetadata,
} from "../integrations/shared/index";
import {
  checkToolCall,
  checkWebBrowse,
  checkPurchase,
} from "../integrations/openai/index";
import {
  checkToolUse,
  buildDeniedToolResult,
} from "../integrations/anthropic/index";
import {
  wrapToolWithBehalfID,
  wrapToolsWithBehalfID,
} from "../integrations/langchain/index";
import { wrapLlamaToolWithBehalfID } from "../integrations/llamaindex/index";
import {
  gateCheckoutSession,
  gateCharge,
  gateSubscriptionChange,
  gateRefund,
} from "../integrations/stripe/index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAllowedResult(overrides?: Partial<VerifyResult>): VerifyResult {
  return {
    requestId: "req_test_allowed",
    allowed: true,
    reason: "Action allowed by active permission.",
    risk: "low",
    ...overrides,
  };
}

function makeDeniedResult(overrides?: Partial<VerifyResult>): VerifyResult {
  return {
    requestId: "req_test_denied",
    allowed: false,
    reason: "No active permission exists for this action.",
    risk: "high",
    ...overrides,
  };
}

function makeClient(result: VerifyResult): BehalfIDClient {
  return { verify: vi.fn().mockResolvedValue(result) };
}

function makeConfig(result: VerifyResult): IntegrationConfig {
  return { client: makeClient(result), agentId: "agent_test" };
}

// ─── shared utilities ─────────────────────────────────────────────────────────

describe("shared: makeDenyResponse", () => {
  it("normalizes a denied VerifyResult into a DenyResponse", () => {
    const result = makeDeniedResult();
    const deny = makeDenyResponse(result);
    expect(deny.blocked).toBe(true);
    expect(deny.reason).toBe(result.reason);
    expect(deny.risk).toBe(result.risk);
    expect(deny.requestId).toBe(result.requestId);
  });
});

describe("shared: requireEnvVars", () => {
  it("throws with the missing var name when absent", () => {
    const key = "BEHALF_TEST_MISSING_VAR_XYZ";
    delete process.env[key];
    expect(() => requireEnvVars([key])).toThrow(key);
  });

  it("does not throw when all vars are present", () => {
    const key = "BEHALF_TEST_PRESENT_VAR_XYZ";
    process.env[key] = "1";
    expect(() => requireEnvVars([key])).not.toThrow();
    delete process.env[key];
  });
});

describe("shared: mapToVerifyInput", () => {
  it("builds a VerifyInput with agentId and action", () => {
    const input = mapToVerifyInput("agent_1", "purchase", { amount: 100 });
    expect(input).toEqual({ agentId: "agent_1", action: "purchase", amount: 100 });
  });
});

describe("shared: withAuditMetadata", () => {
  it("merges new metadata without overwriting existing keys", () => {
    const base = mapToVerifyInput("a", "b", { metadata: { existing: 1 } });
    const result = withAuditMetadata(base, { new: 2 });
    expect(result.metadata).toEqual({ existing: 1, new: 2 });
  });
});

// ─── OpenAI adapter ───────────────────────────────────────────────────────────

describe("OpenAI: checkToolCall", () => {
  it("calls execute and returns AllowedResponse when allowed", async () => {
    const config = makeConfig(makeAllowedResult());
    const execute = vi.fn().mockResolvedValue({ data: "ok" });

    const result = await checkToolCall(config, { name: "search", arguments: {} }, execute);

    expect(result.blocked).toBe(false);
    if (!result.blocked) expect(result.result).toEqual({ data: "ok" });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("returns DenyResponse and does not call execute when denied", async () => {
    const config = makeConfig(makeDeniedResult());
    const execute = vi.fn();

    const result = await checkToolCall(config, { name: "search", arguments: {} }, execute);

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("forwards verify overrides to the client", async () => {
    const client = makeClient(makeAllowedResult());
    const config: IntegrationConfig = { client, agentId: "agent_1" };
    await checkToolCall(
      config,
      { name: "purchase", arguments: {} },
      async () => "ok",
      { amount: 500, vendor: "acme.com" }
    );
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "purchase", amount: 500, vendor: "acme.com" })
    );
  });

  it("includes requestId in AllowedResponse", async () => {
    const config = makeConfig(makeAllowedResult({ requestId: "req_xyz" }));
    const result = await checkToolCall(config, { name: "noop", arguments: {} }, async () => null);
    expect(result.blocked).toBe(false);
    if (!result.blocked) expect(result.requestId).toBe("req_xyz");
  });
});

describe("OpenAI: checkWebBrowse", () => {
  it("sets action to browse_web and resource to hostname", async () => {
    const client = makeClient(makeAllowedResult());
    const config: IntegrationConfig = { client, agentId: "agent_1" };
    await checkWebBrowse(config, "https://example.com/page?q=1", async () => "html");
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "browse_web", resource: "example.com" })
    );
  });

  it("blocks and does not call execute when denied", async () => {
    const config = makeConfig(makeDeniedResult());
    const execute = vi.fn();
    const result = await checkWebBrowse(config, "https://blocked.com", execute);
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("OpenAI: checkPurchase", () => {
  it("passes amount and vendor to verify", async () => {
    const client = makeClient(makeAllowedResult());
    const config: IntegrationConfig = { client, agentId: "agent_1" };
    await checkPurchase(config, { vendor: "stripe.com", amount: 999, execute: async () => "ok" });
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "purchase", amount: 999, vendor: "stripe.com" })
    );
  });

  it("does not call execute when denied", async () => {
    const config = makeConfig(makeDeniedResult());
    const execute = vi.fn();
    const result = await checkPurchase(config, { vendor: "stripe.com", amount: 100, execute });
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});

// ─── Anthropic adapter ────────────────────────────────────────────────────────

describe("Anthropic: checkToolUse", () => {
  const toolBlock = { id: "toolu_01abc", name: "send_email", input: { to: "user@example.com" } };

  it("returns AllowedResponse with tool_use_id echoed when allowed", async () => {
    const config = makeConfig(makeAllowedResult());
    const result = await checkToolUse(config, toolBlock, async () => ({ sent: true }));
    expect(result.blocked).toBe(false);
    expect(result.tool_use_id).toBe("toolu_01abc");
    if (!result.blocked) expect(result.result).toEqual({ sent: true });
  });

  it("returns DenyResponse with tool_use_id and does not call execute when denied", async () => {
    const config = makeConfig(makeDeniedResult());
    const execute = vi.fn();
    const result = await checkToolUse(config, toolBlock, execute);
    expect(result.blocked).toBe(true);
    expect(result.tool_use_id).toBe("toolu_01abc");
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses tool name as action in verify", async () => {
    const client = makeClient(makeAllowedResult());
    const config: IntegrationConfig = { client, agentId: "agent_1" };
    await checkToolUse(config, toolBlock, async () => null);
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "send_email" })
    );
  });
});

describe("Anthropic: buildDeniedToolResult", () => {
  it("returns a tool_result-shaped object", () => {
    const result = buildDeniedToolResult("toolu_01abc", "Permission revoked.");
    expect(result.type).toBe("tool_result");
    expect(result.tool_use_id).toBe("toolu_01abc");
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("Permission revoked.");
  });
});

// ─── LangChain adapter ────────────────────────────────────────────────────────

describe("LangChain: wrapToolWithBehalfID", () => {
  const purchaseTool = {
    name: "purchaseTicket",
    description: "Purchase a ticket.",
    call: vi.fn(),
  };

  beforeEach(() => {
    purchaseTool.call.mockClear();
    purchaseTool.call.mockResolvedValue("ticket_confirmed");
  });

  it("preserves name and description", () => {
    const config = makeConfig(makeAllowedResult());
    const wrapped = wrapToolWithBehalfID(config, purchaseTool);
    expect(wrapped.name).toBe("purchaseTicket");
    expect(wrapped.description).toBe("Purchase a ticket.");
  });

  it("calls underlying tool and returns its result when allowed", async () => {
    const config = makeConfig(makeAllowedResult());
    const wrapped = wrapToolWithBehalfID(config, purchaseTool);
    const result = await wrapped.call("event_123");
    expect(purchaseTool.call).toHaveBeenCalledWith("event_123");
    expect(result).toBe("ticket_confirmed");
  });

  it("returns DenyResponse and does not call tool when denied", async () => {
    const config = makeConfig(makeDeniedResult());
    const wrapped = wrapToolWithBehalfID(config, purchaseTool);
    const result = await wrapped.call("event_123");
    expect(purchaseTool.call).not.toHaveBeenCalled();
    expect(result).toMatchObject({ blocked: true });
  });

  it("uses tool name as action in verify", async () => {
    const client = makeClient(makeAllowedResult());
    const config: IntegrationConfig = { client, agentId: "agent_1" };
    const wrapped = wrapToolWithBehalfID(config, purchaseTool);
    await wrapped.call("x");
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "purchaseTicket" })
    );
  });
});

describe("LangChain: wrapToolsWithBehalfID", () => {
  it("wraps all tools in the array and preserves order", () => {
    const config = makeConfig(makeAllowedResult());
    const tools = [
      { name: "toolA", description: "A", call: vi.fn() },
      { name: "toolB", description: "B", call: vi.fn() },
    ];
    const wrapped = wrapToolsWithBehalfID(config, tools);
    expect(wrapped).toHaveLength(2);
    expect(wrapped[0].name).toBe("toolA");
    expect(wrapped[1].name).toBe("toolB");
  });
});

// ─── LlamaIndex adapter ───────────────────────────────────────────────────────

describe("LlamaIndex: wrapLlamaToolWithBehalfID", () => {
  const llamaTool = {
    metadata: {
      name: "searchKnowledgeBase",
      description: "Search the knowledge base.",
      parameters: { type: "object", properties: { query: { type: "string" } } },
    },
    call: vi.fn(),
  };

  beforeEach(() => {
    llamaTool.call.mockClear();
    llamaTool.call.mockResolvedValue({ hits: ["result_1"] });
  });

  it("preserves metadata including parameters", () => {
    const config = makeConfig(makeAllowedResult());
    const wrapped = wrapLlamaToolWithBehalfID(config, llamaTool);
    expect(wrapped.metadata.name).toBe("searchKnowledgeBase");
    expect(wrapped.metadata.description).toBe("Search the knowledge base.");
    expect(wrapped.metadata.parameters).toEqual(llamaTool.metadata.parameters);
  });

  it("calls tool and returns result when allowed", async () => {
    const config = makeConfig(makeAllowedResult());
    const wrapped = wrapLlamaToolWithBehalfID(config, llamaTool);
    const result = await wrapped.call({ query: "agents" });
    expect(llamaTool.call).toHaveBeenCalledWith({ query: "agents" });
    expect(result).toEqual({ hits: ["result_1"] });
  });

  it("returns DenyResponse and does not call tool when denied", async () => {
    const config = makeConfig(makeDeniedResult());
    const wrapped = wrapLlamaToolWithBehalfID(config, llamaTool);
    const result = await wrapped.call({ query: "agents" });
    expect(llamaTool.call).not.toHaveBeenCalled();
    expect(result).toMatchObject({ blocked: true });
  });

  it("uses metadata.name as action in verify", async () => {
    const client = makeClient(makeAllowedResult());
    const config: IntegrationConfig = { client, agentId: "agent_1" };
    const wrapped = wrapLlamaToolWithBehalfID(config, llamaTool);
    await wrapped.call({ query: "test" });
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "searchKnowledgeBase" })
    );
  });
});

// ─── Stripe adapter ───────────────────────────────────────────────────────────

describe("Stripe: gateCheckoutSession", () => {
  it("calls execute and returns AllowedResponse when allowed", async () => {
    const config = makeConfig(makeAllowedResult());
    const execute = vi.fn().mockResolvedValue({ id: "cs_test" });
    const result = await gateCheckoutSession(config, { amountTotal: 4999, execute });
    expect(result.blocked).toBe(false);
    if (!result.blocked) expect(result.result).toEqual({ id: "cs_test" });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("blocks execute when denied", async () => {
    const config = makeConfig(makeDeniedResult());
    const execute = vi.fn();
    const result = await gateCheckoutSession(config, { amountTotal: 4999, execute });
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes amountTotal as amount to verify", async () => {
    const client = makeClient(makeAllowedResult());
    const config: IntegrationConfig = { client, agentId: "agent_1" };
    await gateCheckoutSession(config, { amountTotal: 9999, execute: async () => null });
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "stripe:checkout", amount: 9999, vendor: "stripe.com" })
    );
  });
});

describe("Stripe: gateCharge", () => {
  it("passes amount and vendor to verify", async () => {
    const client = makeClient(makeAllowedResult());
    const config: IntegrationConfig = { client, agentId: "agent_1" };
    await gateCharge(config, { amount: 2000, execute: async () => null });
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "stripe:charge", amount: 2000, vendor: "stripe.com" })
    );
  });

  it("blocks execute when denied", async () => {
    const config = makeConfig(makeDeniedResult());
    const execute = vi.fn();
    await gateCharge(config, { amount: 2000, execute });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("Stripe: gateSubscriptionChange", () => {
  it("includes subscriptionId in metadata", async () => {
    const client = makeClient(makeAllowedResult());
    const config: IntegrationConfig = { client, agentId: "agent_1" };
    await gateSubscriptionChange(config, { subscriptionId: "sub_abc", execute: async () => null });
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "stripe:subscription_change",
        metadata: expect.objectContaining({ subscriptionId: "sub_abc" }),
      })
    );
  });

  it("blocks execute when denied", async () => {
    const config = makeConfig(makeDeniedResult());
    const execute = vi.fn();
    await gateSubscriptionChange(config, { subscriptionId: "sub_abc", execute });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("Stripe: gateRefund", () => {
  it("passes amount and chargeId to verify", async () => {
    const client = makeClient(makeAllowedResult());
    const config: IntegrationConfig = { client, agentId: "agent_1" };
    await gateRefund(config, { chargeId: "ch_test", amount: 1500, execute: async () => null });
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "stripe:refund",
        amount: 1500,
        metadata: expect.objectContaining({ chargeId: "ch_test" }),
      })
    );
  });

  it("blocks execute when denied", async () => {
    const config = makeConfig(makeDeniedResult());
    const execute = vi.fn();
    await gateRefund(config, { chargeId: "ch_test", execute });
    expect(execute).not.toHaveBeenCalled();
  });
});
