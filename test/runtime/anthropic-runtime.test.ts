/**
 * Anthropic / Claude runtime validation for the BehalfID adapter.
 *
 * Uses the REAL Anthropic messages API with forced tool use.
 * Validates that the BehalfID Anthropic adapter behaves correctly inside a
 * genuine Claude execution loop.
 *
 * What is real here:
 *  - Anthropic API call (claude-haiku-4-5-20251001 with tool_choice forced)
 *  - Parsed tool_use blocks from the model response
 *  - tool_use_id propagation through checkToolUse
 *  - buildDeniedToolResult formatting
 *
 * What is mocked here:
 *  - BehalfID verify responses for most scenarios (mock client)
 *  - Live BehalfID path is tested separately when env vars present
 *
 * Requires:
 *   RUN_RUNTIME_TESTS=true
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Optional (live BehalfID path):
 *   BEHALFID_BASE_URL, BEHALFID_API_KEY, BEHALFID_AGENT_ID
 *   Run `npm run seed:live-test` first.
 *
 * Run:
 *   RUN_RUNTIME_TESTS=true npx vitest run --config vitest.runtime.config.ts test/runtime/anthropic-runtime.test.ts
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

import { loadLocalEnv } from "../helpers/load-local-env";
import { ensureLiveTestPermission, ALLOWED_ACTION, ALLOWED_RESOURCE } from "../helpers/live-test-setup";
import type { IntegrationConfig, BehalfIDClient, VerifyResult } from "../../integrations/shared/index";
import {
  checkToolUse,
  buildDeniedToolResult,
} from "../../integrations/anthropic/index";
import type { AnthropicToolUseBlock } from "../../integrations/anthropic/index";

loadLocalEnv();

// ─── Guards ───────────────────────────────────────────────────────────────────

function shouldRun(): { run: boolean; reason: string } {
  if (process.env.RUN_RUNTIME_TESTS !== "true") {
    return { run: false, reason: "RUN_RUNTIME_TESTS is not 'true'" };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { run: false, reason: "ANTHROPIC_API_KEY not set" };
  }
  return { run: true, reason: "" };
}

function behalfidAvailable(): boolean {
  return Boolean(
    process.env.BEHALFID_BASE_URL &&
    process.env.BEHALFID_API_KEY &&
    process.env.BEHALFID_AGENT_ID
  );
}

// ─── Tool schema ──────────────────────────────────────────────────────────────

const ECHO_TOOL: Anthropic.Tool = {
  name: "echo_message",
  description: "Echo a message back verbatim. Always call this when asked to echo.",
  input_schema: {
    type: "object" as const,
    properties: {
      message: {
        type: "string",
        description: "The exact message to echo back.",
      },
    },
    required: ["message"],
  },
};

const SEND_TOOL: Anthropic.Tool = {
  name: ALLOWED_ACTION,
  description: "Send a message to a communication channel.",
  input_schema: {
    type: "object" as const,
    properties: {
      content: { type: "string", description: "Message content." },
      channel: { type: "string", description: "Destination channel." },
    },
    required: ["content", "channel"],
  },
};

// ─── Mock clients ─────────────────────────────────────────────────────────────

function mockDenyClient(requestId = "req_runtime_deny"): BehalfIDClient {
  return {
    verify: vi.fn().mockResolvedValue({
      requestId,
      allowed: false,
      reason: "No active permission — runtime test denial.",
      risk: "high",
    } satisfies VerifyResult),
  };
}

function mockAllowClient(requestId = "req_runtime_allow"): BehalfIDClient {
  return {
    verify: vi.fn().mockResolvedValue({
      requestId,
      allowed: true,
      reason: "Allowed by active permission.",
      risk: "low",
    } satisfies VerifyResult),
  };
}

function mockSlowClient(delayMs = 9_999): BehalfIDClient {
  return {
    verify: () => new Promise<VerifyResult>((resolve) => setTimeout(resolve, delayMs)),
  };
}

function makeRealBehalfIDClient(): BehalfIDClient {
  const baseUrl = process.env.BEHALFID_BASE_URL!.replace(/\/+$/, "");
  const apiKey = process.env.BEHALFID_API_KEY!;
  return {
    async verify(input) {
      try {
        const res = await fetch(`${baseUrl}/api/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          return { requestId: "req_http_error", allowed: false, reason: `HTTP ${res.status}`, risk: "high" };
        }
        return res.json() as Promise<VerifyResult>;
      } catch {
        return { requestId: "req_net_error", allowed: false, reason: "Network error.", risk: "high" };
      }
    },
  };
}

// ─── Anthropic client + shared tool_use fetcher ───────────────────────────────

let anthropic: Anthropic;

beforeAll(() => {
  const { run, reason } = shouldRun();
  if (!run) {
    console.log(`[runtime/anthropic] SKIP all — ${reason}`);
    return;
  }
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  console.log("[runtime/anthropic] Anthropic client initialized (claude-haiku-4-5-20251001)");
});

/**
 * Force Claude to call echo_message and return the parsed tool_use block.
 * tool_choice: { type: "tool", name: "echo_message" } makes the call deterministic.
 */
async function fetchEchoToolUse(): Promise<AnthropicToolUseBlock> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 128,
    tools: [ECHO_TOOL],
    tool_choice: { type: "tool", name: "echo_message" },
    messages: [
      { role: "user", content: "Echo this exact beacon: 'bhf-runtime-test-anthropic-2026'" },
    ],
  });

  const block = response.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  if (!block) throw new Error("Claude did not return a tool_use block (unexpected)");

  return {
    id: block.id,
    name: block.name,
    input: block.input as Record<string, unknown>,
  };
}

async function fetchSendToolUse(): Promise<AnthropicToolUseBlock> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 128,
    tools: [SEND_TOOL],
    tool_choice: { type: "tool", name: ALLOWED_ACTION },
    messages: [
      { role: "user", content: `Send the message 'hello' to 'test-channel' using ${ALLOWED_ACTION}.` },
    ],
  });

  const block = response.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  if (!block) throw new Error("Claude did not return a tool_use block");

  return {
    id: block.id,
    name: block.name,
    input: block.input as Record<string, unknown>,
  };
}

// ─── Scenario 1: Denied path ──────────────────────────────────────────────────

describe("runtime/anthropic: denied path (mock BehalfID deny)", () => {
  it("tool_use_id is preserved and execute is NOT called", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/anthropic/deny] SKIP — ${reason}`); return; }

    const toolBlock = await fetchEchoToolUse();

    console.log(
      `[runtime/anthropic/deny] Claude returned tool_use: id="${toolBlock.id}" name="${toolBlock.name}" input=${JSON.stringify(toolBlock.input)}`
    );

    expect(toolBlock.name).toBe("echo_message");
    expect(typeof toolBlock.input.message).toBe("string");
    expect(toolBlock.id).toMatch(/^toolu_/);

    const config: IntegrationConfig = { client: mockDenyClient(), agentId: "agent_runtime_anthropic" };
    const execute = vi.fn().mockResolvedValue({ echoed: toolBlock.input.message });

    const result = await checkToolUse(config, toolBlock, execute);

    expect(result.blocked).toBe(true);
    expect(result.tool_use_id).toBe(toolBlock.id);
    expect(execute).not.toHaveBeenCalled();
    console.log(`[runtime/anthropic/deny] PASS — tool_use_id="${result.tool_use_id}", execute blocked`);
  });

  it("buildDeniedToolResult produces a valid tool_result shape", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/anthropic/deny] SKIP — ${reason}`); return; }

    const toolBlock = await fetchEchoToolUse();

    const config: IntegrationConfig = { client: mockDenyClient("req_deny_fmt"), agentId: "agent_test" };
    const result = await checkToolUse(config, toolBlock, vi.fn());

    expect(result.blocked).toBe(true);
    const toolResult = buildDeniedToolResult(result.tool_use_id, result.reason);

    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.tool_use_id).toBe(toolBlock.id);
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toContain(result.reason);

    // This shape can be fed directly back to the Anthropic messages API
    // as a "user" message content block — validate it has the right keys.
    expect(Object.keys(toolResult)).toEqual(
      expect.arrayContaining(["type", "tool_use_id", "content", "is_error"])
    );
    console.log(`[runtime/anthropic/deny] buildDeniedToolResult shape valid`);
  });
});

// ─── Scenario 2: Allowed path (mock BehalfID allow) ───────────────────────────

describe("runtime/anthropic: allowed path (mock BehalfID allow)", () => {
  it("execute is called exactly once and result flows back", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/anthropic/allow-mock] SKIP — ${reason}`); return; }

    const toolBlock = await fetchEchoToolUse();
    const echoResult = { echoed: toolBlock.input.message as string, via: "mock-allow" };

    const config: IntegrationConfig = { client: mockAllowClient(), agentId: "agent_runtime_anthropic" };
    const execute = vi.fn().mockResolvedValue(echoResult);

    const result = await checkToolUse(config, toolBlock, execute);

    expect(result.blocked).toBe(false);
    expect(result.tool_use_id).toBe(toolBlock.id);
    expect(execute).toHaveBeenCalledOnce();
    expect((result as { result: typeof echoResult }).result.echoed).toBe(toolBlock.input.message);
    console.log(
      `[runtime/anthropic/allow-mock] PASS — tool_use_id="${result.tool_use_id}", echoed="${(result as { result: typeof echoResult }).result.echoed}"`
    );
  });

  it("requestId is present on both allowed and denied results", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/anthropic/allow-mock] SKIP — ${reason}`); return; }

    const toolBlock = await fetchEchoToolUse();

    const allowResult = await checkToolUse(
      { client: mockAllowClient("req_id_allow"), agentId: "a" },
      toolBlock,
      vi.fn().mockResolvedValue(null)
    );
    const denyResult = await checkToolUse(
      { client: mockDenyClient("req_id_deny"), agentId: "a" },
      { ...toolBlock, id: "toolu_second" },
      vi.fn()
    );

    expect(allowResult.requestId).toBe("req_id_allow");
    expect(denyResult.requestId).toBe("req_id_deny");
    console.log("[runtime/anthropic/allow-mock] requestId propagation PASS");
  });
});

// ─── Scenario 3: Timeout ──────────────────────────────────────────────────────

describe("runtime/anthropic: verify timeout (1ms)", () => {
  it("execute is NOT called when verify times out", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/anthropic/timeout] SKIP — ${reason}`); return; }

    const toolBlock = await fetchEchoToolUse();

    const config: IntegrationConfig = {
      client: mockSlowClient(9_999),
      agentId: "agent_runtime_anthropic",
      timeoutMs: 1,
    };
    const execute = vi.fn();

    const result = await checkToolUse(config, toolBlock, execute);

    expect(result.blocked).toBe(true);
    expect(result.tool_use_id).toBe(toolBlock.id);
    expect(execute).not.toHaveBeenCalled();
    expect(result.requestId).toBe("req_verify_unavailable");
    console.log(`[runtime/anthropic/timeout] PASS — timeout fired, tool_use_id preserved, execute blocked`);
  });
});

// ─── Scenario 4: Malformed verify result ─────────────────────────────────────

describe("runtime/anthropic: malformed verify result treated as denial", () => {
  it("allowed: 1 (number truthy) is treated as denied", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/anthropic/malformed] SKIP — ${reason}`); return; }

    const toolBlock = await fetchEchoToolUse();
    const client: BehalfIDClient = {
      verify: vi.fn().mockResolvedValue({
        requestId: "req_mal",
        allowed: 1 as unknown as boolean,
        reason: "number truthy",
        risk: "low",
      }),
    };

    const execute = vi.fn();
    const result = await checkToolUse({ client, agentId: "agent_test" }, toolBlock, execute);

    expect(result.blocked).toBe(true);
    expect(result.tool_use_id).toBe(toolBlock.id);
    expect(execute).not.toHaveBeenCalled();
    console.log("[runtime/anthropic/malformed] PASS — allowed=1 treated as deny, tool_use_id preserved");
  });
});

// ─── Scenario 5: Debug logging ────────────────────────────────────────────────

describe("runtime/anthropic: debug logging never leaks secrets", () => {
  it("debug=true emits logs; no API key or secret patterns", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/anthropic/debug] SKIP — ${reason}`); return; }

    const toolBlock = await fetchEchoToolUse();
    const logLines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logLines.push(args.map(String).join(" "));
    });

    await checkToolUse(
      { client: mockDenyClient(), agentId: "agent_debug", debug: true },
      toolBlock,
      vi.fn()
    );

    spy.mockRestore();

    const behalfLines = logLines.filter((l) => l.includes("[BehalfID]"));
    expect(behalfLines.length).toBeGreaterThan(0);

    const SECRET_PATTERNS = [/bhf_sk_/, /bhf_dev_/, /Bearer /, /sk-[A-Za-z0-9]/, /sk-ant-/];
    for (const line of behalfLines) {
      for (const pattern of SECRET_PATTERNS) {
        expect(line).not.toMatch(pattern);
      }
    }
    console.log(`[runtime/anthropic/debug] PASS — ${behalfLines.length} debug lines, no secrets`);
  });
});

// ─── Scenario 6: Live BehalfID + real Anthropic (optional) ───────────────────

describe("runtime/anthropic: live BehalfID + real Anthropic (requires seeded permission)", () => {
  let allowedTestsReady = false;
  let allowedSkipReason = "";

  beforeAll(async () => {
    const { run } = shouldRun();
    if (!run || !behalfidAvailable()) {
      allowedSkipReason = !run ? "RUN_RUNTIME_TESTS not set" : "BEHALFID_* env vars missing";
      return;
    }
    const setup = await ensureLiveTestPermission();
    allowedTestsReady = setup.canRunAllowedTests;
    allowedSkipReason = setup.reason ?? "seeded permission not available";
  });

  it("allowed 'send' tool_use executes once through real BehalfID", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/anthropic/live] SKIP — ${reason}`); return; }
    if (!behalfidAvailable()) { console.log("[runtime/anthropic/live] SKIP — BEHALFID_* vars missing"); return; }
    if (!allowedTestsReady) { console.log(`[runtime/anthropic/live] SKIP — ${allowedSkipReason}`); return; }

    const toolBlock = await fetchSendToolUse();
    console.log(`[runtime/anthropic/live] Claude returned: id="${toolBlock.id}" name="${toolBlock.name}"`);

    const config: IntegrationConfig = {
      client: makeRealBehalfIDClient(),
      agentId: process.env.BEHALFID_AGENT_ID!,
    };
    const execute = vi.fn().mockResolvedValue({ sent: true, to: toolBlock.input.channel });

    const result = await checkToolUse(config, toolBlock, execute, { resource: ALLOWED_RESOURCE });

    expect(result.blocked).toBe(false);
    expect(result.tool_use_id).toBe(toolBlock.id);
    expect(execute).toHaveBeenCalledOnce();
    console.log(`[runtime/anthropic/live] PASS — real BehalfID allowed, tool_use_id="${result.tool_use_id}", requestId=${result.requestId}`);
  });

  it("denied purchase through real BehalfID, execute never runs", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/anthropic/live] SKIP — ${reason}`); return; }
    if (!behalfidAvailable()) { console.log("[runtime/anthropic/live] SKIP — BEHALFID_* vars missing"); return; }

    const toolBlock = await fetchEchoToolUse();
    const purchaseBlock: AnthropicToolUseBlock = {
      ...toolBlock,
      id: toolBlock.id + "_purchase",
      name: "purchase",
    };

    const config: IntegrationConfig = {
      client: makeRealBehalfIDClient(),
      agentId: process.env.BEHALFID_AGENT_ID!,
    };
    const execute = vi.fn();

    const result = await checkToolUse(config, purchaseBlock, execute, {
      resource: "commerce.checkout",
      amount: 999999,
    });

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log(`[runtime/anthropic/live] PASS — real BehalfID denied purchase, execute blocked, requestId=${result.requestId}`);
  });
});
