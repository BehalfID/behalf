/**
 * Unit tests for the BehalfID LlamaIndex adapter.
 *
 * No LlamaIndex SDK dependency is required — the adapter uses structural
 * (duck-type) compatibility. Tests use manually constructed tool objects.
 *
 * Real LlamaIndex runtime coverage (FunctionTool.from(), ReActAgent) remains
 * pending until llamaindex is added as a dev dependency. See
 * docs/COMPATIBILITY_MATRIX.md for the full status.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BehalfIDClient, IntegrationConfig, VerifyResult } from "../integrations/shared/index";
import { wrapLlamaToolWithBehalfID } from "../integrations/llamaindex/index";
import type { LlamaIndexToolLike } from "../integrations/llamaindex/index";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeAllowed(): VerifyResult {
  return { requestId: "req_llama_allow", allowed: true, reason: "Allowed.", risk: "low" };
}

function makeDenied(): VerifyResult {
  return { requestId: "req_llama_deny", allowed: false, reason: "No permission.", risk: "high" };
}

function makeClient(result: VerifyResult): BehalfIDClient {
  return { verify: vi.fn().mockResolvedValue(result) };
}

function makeConfig(result: VerifyResult): IntegrationConfig {
  return { client: makeClient(result), agentId: "agent_llama_test" };
}

function makeTool<TInput = Record<string, unknown>, TOutput = string>(
  name: string,
  callImpl: (input: TInput) => Promise<TOutput>
): LlamaIndexToolLike<TInput, TOutput> {
  return {
    metadata: {
      name,
      description: `Test tool: ${name}`,
      parameters: { type: "object", properties: {} },
    },
    call: vi.fn().mockImplementation(callImpl),
  };
}

// ─── Denied path ──────────────────────────────────────────────────────────────

describe("llamaindex adapter: denied path", () => {
  it("returns DenyResponse when BehalfID denies the action", async () => {
    const tool = makeTool("purchaseItem", async () => "purchased");
    const wrapped = wrapLlamaToolWithBehalfID(makeConfig(makeDenied()), tool);

    const result = await wrapped.call({ amount: 999 });

    expect((result as { blocked: boolean }).blocked).toBe(true);
    expect((result as { reason: string }).reason).toBeTruthy();
    expect((result as { requestId: string }).requestId).toBe("req_llama_deny");
  });

  it("does not call the original tool when denied", async () => {
    const tool = makeTool("purchaseItem", async () => "purchased");
    const wrapped = wrapLlamaToolWithBehalfID(makeConfig(makeDenied()), tool);

    await wrapped.call({});

    expect(tool.call).not.toHaveBeenCalled();
  });

  it("preserves tool metadata on the wrapped tool", () => {
    const tool = makeTool("fetchData", async () => ({ ok: true }));
    const wrapped = wrapLlamaToolWithBehalfID(makeConfig(makeDenied()), tool);

    expect(wrapped.metadata.name).toBe("fetchData");
    expect(wrapped.metadata.description).toBe("Test tool: fetchData");
    expect(wrapped.metadata.parameters).toEqual({ type: "object", properties: {} });
  });

  it("returns DenyResponse when verify throws (fail-closed)", async () => {
    const client: BehalfIDClient = {
      verify: vi.fn().mockRejectedValue(new Error("Network failure")),
    };
    const config: IntegrationConfig = { client, agentId: "agent_llama_test" };
    const tool = makeTool("fetchData", async () => "data");
    const wrapped = wrapLlamaToolWithBehalfID(config, tool);

    const result = await wrapped.call({});

    expect((result as { blocked: boolean }).blocked).toBe(true);
    expect((result as { requestId: string }).requestId).toBe("req_verify_unavailable");
    expect(tool.call).not.toHaveBeenCalled();
  });
});

// ─── Allowed path ─────────────────────────────────────────────────────────────

describe("llamaindex adapter: allowed path", () => {
  it("calls the original tool and returns its result when allowed", async () => {
    const tool = makeTool("sendEmail", async (input: Record<string, unknown>) => `sent to ${input.to}`);
    const wrapped = wrapLlamaToolWithBehalfID(makeConfig(makeAllowed()), tool);

    const result = await wrapped.call({ to: "user@example.com" });

    expect(tool.call).toHaveBeenCalledOnce();
    expect(result).toBe("sent to user@example.com");
  });

  it("passes verifyOverrides to verify", async () => {
    const client = makeClient(makeAllowed());
    const config: IntegrationConfig = { client, agentId: "agent_llama_test" };
    const tool = makeTool("queryData", async () => []);

    const wrapped = wrapLlamaToolWithBehalfID(config, tool, {
      resource: "database.readonly",
      amount: 0,
    });

    await wrapped.call({});

    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent_llama_test",
        action: "queryData",
        resource: "database.readonly",
        amount: 0,
      })
    );
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("llamaindex adapter: edge cases", () => {
  it("does not crash when tool.call receives undefined input", async () => {
    const tool = makeTool("noopTool", async (input: unknown) => `got ${JSON.stringify(input)}`);
    const wrapped = wrapLlamaToolWithBehalfID(makeConfig(makeAllowed()), tool as LlamaIndexToolLike<unknown>);

    await expect(wrapped.call(undefined as unknown)).resolves.not.toThrow();
    expect(tool.call).toHaveBeenCalledWith(undefined);
  });

  it("propagates errors thrown by the original tool", async () => {
    const tool = makeTool("faultyTool", async () => {
      throw new Error("tool exploded");
    });
    const wrapped = wrapLlamaToolWithBehalfID(makeConfig(makeAllowed()), tool);

    await expect(wrapped.call({})).rejects.toThrow("tool exploded");
  });

  it("uses tool.metadata.name as the verify action name", async () => {
    const client = makeClient(makeAllowed());
    const config: IntegrationConfig = { client, agentId: "agent_llama_test" };
    const tool = makeTool("my_custom_action", async () => null);

    const wrapped = wrapLlamaToolWithBehalfID(config, tool);
    await wrapped.call({});

    expect(client.verify).toHaveBeenCalledWith(
      expect.objectContaining({ action: "my_custom_action" })
    );
  });

  it("works with tools that have no parameters in metadata", async () => {
    const tool: LlamaIndexToolLike<string, string> = {
      metadata: { name: "simpleTool", description: "No schema" },
      call: vi.fn().mockResolvedValue("done"),
    };
    const wrapped = wrapLlamaToolWithBehalfID(makeConfig(makeAllowed()), tool);

    expect(wrapped.metadata.parameters).toBeUndefined();
    const result = await wrapped.call("input");
    expect(result).toBe("done");
  });

  it("timeoutMs=1 on config causes fail-closed denial", async () => {
    const client: BehalfIDClient = {
      verify: () => new Promise<VerifyResult>((resolve) => setTimeout(resolve, 9999)),
    };
    const config: IntegrationConfig = {
      client,
      agentId: "agent_llama_test",
      timeoutMs: 1,
    };
    const tool = makeTool("timeoutTool", async () => "done");
    const wrapped = wrapLlamaToolWithBehalfID(config, tool);

    const result = await wrapped.call({});

    expect((result as { blocked: boolean }).blocked).toBe(true);
    expect(tool.call).not.toHaveBeenCalled();
  });
});
