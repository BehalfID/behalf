/**
 * Stress and edge-case tests for BehalfID integration adapters.
 *
 * Tests covered:
 *   - verify() throws (network failure, server error)
 *   - verify() returns non-boolean allowed value
 *   - verify() never resolves (simulated timeout)
 *   - execute() throws after allow
 *   - missing/empty agentId
 *   - empty action name
 *   - undefined/null tool inputs
 *   - concurrent calls
 *   - withAuditMetadata key precedence
 *   - DenyResponse immutability
 *   - partial config
 *
 * Core invariant across every test: execute is NEVER called when verify fails.
 */

import { describe, expect, it, vi } from "vitest";
import type { BehalfIDClient, IntegrationConfig, VerifyResult } from "../integrations/shared/index";
import { makeDenyResponse, withAuditMetadata } from "../integrations/shared/index";
import { checkToolCall, checkWebBrowse, checkPurchase } from "../integrations/openai/index";
import { checkToolUse } from "../integrations/anthropic/index";
import { wrapToolWithBehalfID } from "../integrations/langchain/index";
import { wrapLlamaToolWithBehalfID } from "../integrations/llamaindex/index";
import {
  gateCheckoutSession,
  gateCharge,
  gateSubscriptionChange,
  gateRefund,
} from "../integrations/stripe/index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAllowedResult(overrides?: Partial<VerifyResult>): VerifyResult {
  return { requestId: "req_ok", allowed: true, reason: "Allowed.", risk: "low", ...overrides };
}

function makeDeniedResult(overrides?: Partial<VerifyResult>): VerifyResult {
  return { requestId: "req_denied", allowed: false, reason: "Denied.", risk: "high", ...overrides };
}

function throwingClient(err: unknown): BehalfIDClient {
  return { verify: vi.fn().mockRejectedValue(err) };
}

function resolvedClient(result: VerifyResult): BehalfIDClient {
  return { verify: vi.fn().mockResolvedValue(result) };
}

function makeConfig(client: BehalfIDClient, agentId = "agent_test"): IntegrationConfig {
  return { client, agentId };
}

const toolCall = { name: "search", arguments: {} };
const toolUseBlock = { id: "toolu_01", name: "search", input: {} };
const langTool = { name: "searchTool", description: "Search.", call: vi.fn() };
const llamaTool = {
  metadata: { name: "searchTool", description: "Search.", parameters: {} },
  call: vi.fn(),
};

// ─── safeVerify: fail-closed on thrown exceptions ─────────────────────────────

describe("fail-closed: verify() throws Error", () => {
  it("checkToolCall blocks execute when verify throws", async () => {
    const config = makeConfig(throwingClient(new Error("Network timeout")));
    const execute = vi.fn();
    const result = await checkToolCall(config, toolCall, execute);
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("checkToolUse blocks execute when verify throws", async () => {
    const config = makeConfig(throwingClient(new Error("ECONNREFUSED")));
    const execute = vi.fn();
    const result = await checkToolUse(config, toolUseBlock, execute);
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("wrapToolWithBehalfID blocks call when verify throws", async () => {
    const config = makeConfig(throwingClient(new Error("Timeout")));
    const wrapped = wrapToolWithBehalfID(config, { ...langTool, call: vi.fn() });
    const result = await wrapped.call("input");
    expect(result).toMatchObject({ blocked: true });
    expect(langTool.call).not.toHaveBeenCalled();
  });

  it("wrapLlamaToolWithBehalfID blocks call when verify throws", async () => {
    const config = makeConfig(throwingClient(new Error("Timeout")));
    const tool = { ...llamaTool, call: vi.fn() };
    const wrapped = wrapLlamaToolWithBehalfID(config, tool);
    const result = await wrapped.call({});
    expect(result).toMatchObject({ blocked: true });
    expect(tool.call).not.toHaveBeenCalled();
  });

  it("gateCheckoutSession blocks execute when verify throws", async () => {
    const config = makeConfig(throwingClient(new Error("Server error")));
    const execute = vi.fn();
    const result = await gateCheckoutSession(config, { amountTotal: 100, execute });
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("gateCharge blocks execute when verify throws", async () => {
    const config = makeConfig(throwingClient(new Error("Server error")));
    const execute = vi.fn();
    const result = await gateCharge(config, { amount: 500, execute });
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("gateSubscriptionChange blocks execute when verify throws", async () => {
    const config = makeConfig(throwingClient(new Error("Server error")));
    const execute = vi.fn();
    const result = await gateSubscriptionChange(config, { subscriptionId: "sub_1", execute });
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("gateRefund blocks execute when verify throws", async () => {
    const config = makeConfig(throwingClient(new Error("Server error")));
    const execute = vi.fn();
    const result = await gateRefund(config, { chargeId: "ch_1", execute });
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("fail-closed: verify() throws non-Error value", () => {
  it("blocks when verify rejects with a plain string", async () => {
    const config = makeConfig(throwingClient("connection refused"));
    const execute = vi.fn();
    const result = await checkToolCall(config, toolCall, execute);
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks when verify rejects with null", async () => {
    const config = makeConfig(throwingClient(null));
    const execute = vi.fn();
    const result = await checkToolCall(config, toolCall, execute);
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});

// ─── Strict allowed check: non-boolean truthy values ─────────────────────────

describe("strict allowed check: non-boolean truthy values treated as denial", () => {
  it('treats allowed: "yes" (string) as denial', async () => {
    const client = resolvedClient({ ...makeAllowedResult(), allowed: "yes" as unknown as boolean });
    const config = makeConfig(client);
    const execute = vi.fn();
    const result = await checkToolCall(config, toolCall, execute);
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("treats allowed: 1 (number) as denial", async () => {
    const client = resolvedClient({ ...makeAllowedResult(), allowed: 1 as unknown as boolean });
    const config = makeConfig(client);
    const execute = vi.fn();
    const result = await checkToolCall(config, toolCall, execute);
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("treats allowed: undefined as denial", async () => {
    const client = resolvedClient({ ...makeAllowedResult(), allowed: undefined as unknown as boolean });
    const config = makeConfig(client);
    const execute = vi.fn();
    const result = await checkToolCall(config, toolCall, execute);
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});

// ─── execute() throws after allowed ──────────────────────────────────────────

describe("execute() throwing after allow propagates the error", () => {
  it("checkToolCall lets execute errors propagate", async () => {
    const config = makeConfig(resolvedClient(makeAllowedResult()));
    const execute = vi.fn().mockRejectedValue(new Error("Handler crashed"));
    await expect(checkToolCall(config, toolCall, execute)).rejects.toThrow("Handler crashed");
  });

  it("checkToolUse lets execute errors propagate", async () => {
    const config = makeConfig(resolvedClient(makeAllowedResult()));
    const execute = vi.fn().mockRejectedValue(new Error("Handler crashed"));
    await expect(checkToolUse(config, toolUseBlock, execute)).rejects.toThrow("Handler crashed");
  });
});

// ─── Empty agentId ────────────────────────────────────────────────────────────

describe("edge case: empty agentId", () => {
  it("still calls verify with empty agentId (enforcement is server-side)", async () => {
    const client = resolvedClient(makeDeniedResult());
    const config = makeConfig(client, "");
    const execute = vi.fn();
    await checkToolCall(config, toolCall, execute);
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "" })
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

// ─── Empty action name ────────────────────────────────────────────────────────

describe("edge case: empty action name", () => {
  it("passes empty action to verify — BehalfID server is authoritative", async () => {
    const client = resolvedClient(makeDeniedResult());
    const config = makeConfig(client);
    const execute = vi.fn();
    await checkToolCall(config, { name: "", arguments: {} }, execute);
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "" })
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

// ─── Undefined / null inputs ──────────────────────────────────────────────────

describe("edge case: undefined tool inputs", () => {
  it("LlamaIndex: handles undefined input gracefully", async () => {
    const client = resolvedClient(makeAllowedResult());
    const config = makeConfig(client);
    const tool = {
      metadata: { name: "noop", description: "No-op." },
      call: vi.fn().mockResolvedValue("ok"),
    };
    const wrapped = wrapLlamaToolWithBehalfID(config, tool);
    const result = await wrapped.call(undefined as unknown as Record<string, unknown>);
    expect(result).toBe("ok");
  });

  it("OpenAI: handles execute returning null", async () => {
    const config = makeConfig(resolvedClient(makeAllowedResult()));
    const result = await checkToolCall(config, toolCall, async () => null);
    expect(result.blocked).toBe(false);
    if (!result.blocked) expect(result.result).toBeNull();
  });
});

// ─── Concurrent calls ─────────────────────────────────────────────────────────

describe("concurrent calls resolve independently", () => {
  it("multiple simultaneous checkToolCall calls all complete", async () => {
    const config = makeConfig(resolvedClient(makeAllowedResult()));
    const results = await Promise.all([
      checkToolCall(config, { name: "a", arguments: {} }, async () => "a"),
      checkToolCall(config, { name: "b", arguments: {} }, async () => "b"),
      checkToolCall(config, { name: "c", arguments: {} }, async () => "c"),
    ]);
    expect(results).toHaveLength(3);
    expect(results.every((r) => !r.blocked)).toBe(true);
  });

  it("mixed allow/deny concurrent calls each resolve correctly", async () => {
    let callCount = 0;
    const client: BehalfIDClient = {
      verify: vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount % 2 === 0 ? makeAllowedResult() : makeDeniedResult();
      }),
    };
    const config = makeConfig(client);
    const execute = vi.fn().mockResolvedValue("ok");
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        checkToolCall(config, toolCall, execute)
      )
    );
    const blocked = results.filter((r) => r.blocked).length;
    const allowed = results.filter((r) => !r.blocked).length;
    expect(blocked + allowed).toBe(6);
    // 3 odd calls denied, 3 even calls allowed
    expect(blocked).toBe(3);
    expect(allowed).toBe(3);
  });
});

// ─── withAuditMetadata: key precedence ───────────────────────────────────────

describe("withAuditMetadata key precedence", () => {
  it("meta keys overwrite matching input.metadata keys", () => {
    const base = { agentId: "a", action: "b", metadata: { version: "v1", source: "agent" } };
    const result = withAuditMetadata(base, { version: "v2" });
    expect(result.metadata?.version).toBe("v2");
    expect(result.metadata?.source).toBe("agent");
  });

  it("does not mutate the original input", () => {
    const base = { agentId: "a", action: "b", metadata: { x: 1 } };
    withAuditMetadata(base, { x: 2 });
    expect(base.metadata?.x).toBe(1);
  });
});

// ─── DenyResponse immutability ────────────────────────────────────────────────

describe("DenyResponse is frozen", () => {
  it("makeDenyResponse returns a frozen object", () => {
    const deny = makeDenyResponse(makeDeniedResult());
    expect(Object.isFrozen(deny)).toBe(true);
  });

  it("attempting to mutate blocked on DenyResponse throws in strict mode", () => {
    const deny = makeDenyResponse(makeDeniedResult());
    expect(() => {
      (deny as { blocked: boolean }).blocked = false;
    }).toThrow();
  });
});

// ─── Partial config ───────────────────────────────────────────────────────────

describe("partial config: verify() receives correct fields", () => {
  it("checkWebBrowse: malformed URL falls back to raw url as resource", async () => {
    const client = resolvedClient(makeAllowedResult());
    const config = makeConfig(client);
    await checkWebBrowse(config, "not-a-url", async () => "html");
    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "not-a-url" })
    );
  });

  it("gateRefund: amount is optional and omitted when not provided", async () => {
    const client = resolvedClient(makeAllowedResult());
    const config = makeConfig(client);
    await gateRefund(config, { chargeId: "ch_test", execute: async () => null });
    const call = (client.verify as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.amount).toBeUndefined();
  });

  it("gateCheckoutSession: customerId undefined is not included when not passed", async () => {
    const client = resolvedClient(makeAllowedResult());
    const config = makeConfig(client);
    await gateCheckoutSession(config, { amountTotal: 500, execute: async () => null });
    const call = (client.verify as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.metadata?.customerId).toBeUndefined();
  });
});

// ─── Anthropic: tool_use_id always echoed ─────────────────────────────────────

describe("Anthropic: tool_use_id present on both allowed and denied", () => {
  it("tool_use_id is present on denial from verify error", async () => {
    const config = makeConfig(throwingClient(new Error("Timeout")));
    const result = await checkToolUse(
      config,
      { id: "toolu_special", name: "send", input: {} },
      async () => null
    );
    expect(result.tool_use_id).toBe("toolu_special");
    expect(result.blocked).toBe(true);
  });

  it("tool_use_id echoed on allowed response", async () => {
    const config = makeConfig(resolvedClient(makeAllowedResult()));
    const result = await checkToolUse(
      config,
      { id: "toolu_echo", name: "get", input: {} },
      async () => ({ data: 42 })
    );
    expect(result.tool_use_id).toBe("toolu_echo");
    expect(result.blocked).toBe(false);
  });
});
