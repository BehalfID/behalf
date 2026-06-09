/**
 * OpenAI runtime validation for the BehalfID adapter.
 *
 * Uses the REAL OpenAI chat completions API with forced tool calling.
 * Validates that the BehalfID OpenAI adapter behaves correctly inside a
 * genuine OpenAI execution loop — not just with mocked API shapes.
 *
 * What is real here:
 *  - OpenAI API call (gpt-4o-mini with tool_choice forced)
 *  - Parsed tool_call arguments from the model response
 *  - Adapter gate logic (checkToolCall, checkPurchase, checkWebBrowse)
 *  - execute callback invocation / blocking
 *
 * What is mocked here:
 *  - BehalfID verify responses (mock client) for most scenarios
 *  - Live BehalfID path is tested separately when env vars present
 *
 * Requires:
 *   RUN_RUNTIME_TESTS=true
 *   OPENAI_API_KEY=sk-...
 *
 * Optional (for live BehalfID path):
 *   BEHALFID_BASE_URL, BEHALFID_API_KEY, BEHALFID_AGENT_ID
 *   Run `npm run seed:live-test` first.
 *
 * Run:
 *   RUN_RUNTIME_TESTS=true npx vitest run --config vitest.runtime.config.ts test/runtime/openai-runtime.test.ts
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import { loadLocalEnv } from "../helpers/load-local-env";
import { ensureLiveTestPermission, ALLOWED_ACTION, ALLOWED_RESOURCE } from "../helpers/live-test-setup";
import type { IntegrationConfig, BehalfIDClient, VerifyResult } from "../../integrations/shared/index";
import {
  checkToolCall,
  checkPurchase,
  checkWebBrowse,
} from "../../integrations/openai/index";

loadLocalEnv();

// ─── Guards ───────────────────────────────────────────────────────────────────

function shouldRun(): { run: boolean; reason: string } {
  if (process.env.RUN_RUNTIME_TESTS !== "true") {
    return { run: false, reason: "RUN_RUNTIME_TESTS is not 'true'" };
  }
  if (!process.env.OPENAI_API_KEY) {
    return { run: false, reason: "OPENAI_API_KEY not set" };
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

// ─── Tool definition ──────────────────────────────────────────────────────────

/**
 * Harmless tool: echo a message back verbatim.
 * Using this rather than a weather API avoids external service dependencies.
 */
const ECHO_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "echo_message",
    description: "Echo a message back verbatim. Always call this when asked to echo.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The exact message to echo back.",
        },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
};

const SEND_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: ALLOWED_ACTION,
    description: "Send a message to a communication channel.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Message content." },
        channel: { type: "string", description: "Destination channel." },
      },
      required: ["content", "channel"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_MESSAGES: ChatCompletionMessageParam[] = [
  { role: "user", content: "Echo this exact beacon string: 'bhf-runtime-test-openai-2026'" },
];

const SEND_MESSAGES: ChatCompletionMessageParam[] = [
  { role: "user", content: `Send the message 'hello' to channel 'test-channel' using the ${ALLOWED_ACTION} function.` },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function mockMalformedClient(): BehalfIDClient {
  return {
    verify: vi.fn().mockResolvedValue({
      requestId: "req_malformed",
      // deliberately wrong type: string instead of boolean
      allowed: "yes" as unknown as boolean,
      reason: "Malformed verify result.",
      risk: "low",
    }),
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

// ─── OpenAI client + shared tool call fetcher ─────────────────────────────────

let openai: OpenAI;

beforeAll(() => {
  const { run, reason } = shouldRun();
  if (!run) {
    console.log(`[runtime/openai] SKIP all — ${reason}`);
    return;
  }
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log("[runtime/openai] OpenAI client initialized (gpt-4o-mini)");
});

/**
 * Force the model to call echo_message and return the first parsed tool call.
 * With tool_choice forced, the model MUST call the specified function.
 */
async function fetchEchoToolCall(): Promise<{ name: string; arguments: Record<string, unknown> }> {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: SYSTEM_MESSAGES,
    tools: [ECHO_TOOL],
    tool_choice: { type: "function", function: { name: "echo_message" } },
    max_tokens: 64,
  });

  const tc = resp.choices[0]?.message?.tool_calls?.[0];
  if (!tc) throw new Error("OpenAI did not return a tool_call (unexpected)");

  return {
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  };
}

async function fetchSendToolCall(): Promise<{ name: string; arguments: Record<string, unknown> }> {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: SEND_MESSAGES,
    tools: [SEND_TOOL],
    tool_choice: { type: "function", function: { name: ALLOWED_ACTION } },
    max_tokens: 64,
  });

  const tc = resp.choices[0]?.message?.tool_calls?.[0];
  if (!tc) throw new Error("OpenAI did not return a tool_call (unexpected)");

  return {
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  };
}

// ─── Scenario 1: Denied path ──────────────────────────────────────────────────

describe("runtime/openai: denied path (mock BehalfID deny)", () => {
  it("execute is NOT called when BehalfID denies; model-parsed tool call is present", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/openai/deny] SKIP — ${reason}`); return; }

    const toolCall = await fetchEchoToolCall();

    console.log(`[runtime/openai/deny] model returned tool_call: name="${toolCall.name}", args=${JSON.stringify(toolCall.arguments)}`);
    expect(toolCall.name).toBe("echo_message");
    expect(typeof toolCall.arguments.message).toBe("string");

    const config: IntegrationConfig = { client: mockDenyClient(), agentId: "agent_runtime_openai" };
    const execute = vi.fn().mockResolvedValue({ echoed: toolCall.arguments.message });

    const result = await checkToolCall(config, toolCall, execute);

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(result.requestId).toBe("req_runtime_deny");
    console.log(`[runtime/openai/deny] PASS — execute blocked, blocked=true, requestId=${result.requestId}`);
  });
});

// ─── Scenario 2: Allowed path (mock BehalfID allow) ───────────────────────────

describe("runtime/openai: allowed path (mock BehalfID allow)", () => {
  it("execute is called exactly once and result flows back correctly", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/openai/allow-mock] SKIP — ${reason}`); return; }

    const toolCall = await fetchEchoToolCall();
    const echoResult = { echoed: toolCall.arguments.message as string, timestamp: Date.now() };

    const config: IntegrationConfig = { client: mockAllowClient(), agentId: "agent_runtime_openai" };
    const execute = vi.fn().mockResolvedValue(echoResult);

    const result = await checkToolCall(config, toolCall, execute);

    expect(result.blocked).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
    expect((result as { result: typeof echoResult }).result.echoed).toBe(toolCall.arguments.message);
    console.log(
      `[runtime/openai/allow-mock] PASS — execute called, echoed="${(result as { result: typeof echoResult }).result.echoed}", requestId=${result.requestId}`
    );
  });

  it("checkPurchase: execute is called once when allowed (mock)", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/openai/allow-mock] SKIP — ${reason}`); return; }

    const config: IntegrationConfig = { client: mockAllowClient(), agentId: "agent_runtime_openai" };
    const execute = vi.fn().mockResolvedValue({ purchaseId: "purchase_mock_123" });

    const result = await checkPurchase(config, { vendor: "test.example", amount: 10, execute });

    expect(result.blocked).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
    console.log(`[runtime/openai/allow-mock] checkPurchase allowed, execute called`);
  });
});

// ─── Scenario 3: Timeout ──────────────────────────────────────────────────────

describe("runtime/openai: verify timeout (1ms)", () => {
  it("execute is NOT called when verify times out", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/openai/timeout] SKIP — ${reason}`); return; }

    const toolCall = await fetchEchoToolCall();

    const config: IntegrationConfig = {
      client: mockSlowClient(9_999),
      agentId: "agent_runtime_openai",
      timeoutMs: 1,
    };
    const execute = vi.fn();

    const result = await checkToolCall(config, toolCall, execute);

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(result.requestId).toBe("req_verify_unavailable");
    console.log(`[runtime/openai/timeout] PASS — timeout fired, execute blocked`);
  });
});

// ─── Scenario 4: Malformed verify result ─────────────────────────────────────

describe("runtime/openai: malformed verify result treated as denial", () => {
  it("allowed: 'yes' (non-boolean truthy) is treated as denied", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/openai/malformed] SKIP — ${reason}`); return; }

    const toolCall = await fetchEchoToolCall();

    const config: IntegrationConfig = {
      client: mockMalformedClient(),
      agentId: "agent_runtime_openai",
    };
    const execute = vi.fn();

    const result = await checkToolCall(config, toolCall, execute);

    // allowed !== true must fail closed even when it's a truthy non-boolean
    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log(`[runtime/openai/malformed] PASS — allowed="yes" treated as deny`);
  });

  it("allowed: null is treated as denied", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/openai/malformed] SKIP — ${reason}`); return; }

    const toolCall = await fetchEchoToolCall();
    const client: BehalfIDClient = {
      verify: vi.fn().mockResolvedValue({
        requestId: "req_null",
        allowed: null as unknown as boolean,
        reason: "null allowed",
        risk: "low",
      }),
    };

    const execute = vi.fn();
    const result = await checkToolCall({ client, agentId: "agent_test" }, toolCall, execute);

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log(`[runtime/openai/malformed] PASS — allowed=null treated as deny`);
  });
});

// ─── Scenario 5: Debug logging never leaks secrets ───────────────────────────

describe("runtime/openai: debug logging", () => {
  it("debug=true produces logs but never exposes API keys or secrets", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/openai/debug] SKIP — ${reason}`); return; }

    const toolCall = await fetchEchoToolCall();
    const logLines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logLines.push(args.map(String).join(" "));
    });

    const config: IntegrationConfig = {
      client: mockDenyClient(),
      agentId: "agent_debug_test",
      debug: true,
    };
    await checkToolCall(config, toolCall, vi.fn());

    spy.mockRestore();

    // At least one debug line must exist
    const behalfLines = logLines.filter((l) => l.includes("[BehalfID]"));
    expect(behalfLines.length).toBeGreaterThan(0);

    // No line may contain anything that looks like a key or secret
    const SECRET_PATTERNS = [/bhf_sk_/, /bhf_dev_/, /Bearer /, /sk-[A-Za-z0-9]/, /sk-ant-/];
    for (const line of behalfLines) {
      for (const pattern of SECRET_PATTERNS) {
        expect(line).not.toMatch(pattern);
      }
    }
    console.log(`[runtime/openai/debug] PASS — debug logs emitted (${behalfLines.length} lines), no secrets found`);
  });
});

// ─── Scenario 6: Live BehalfID + real OpenAI (optional) ──────────────────────

describe("runtime/openai: live BehalfID + real OpenAI (requires seeded permission)", () => {
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

  it("allowed 'send' tool executes once through real BehalfID", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/openai/live] SKIP — ${reason}`); return; }
    if (!behalfidAvailable()) { console.log("[runtime/openai/live] SKIP — BEHALFID_* vars missing"); return; }
    if (!allowedTestsReady) { console.log(`[runtime/openai/live] SKIP — ${allowedSkipReason}`); return; }

    const toolCall = await fetchSendToolCall();
    console.log(`[runtime/openai/live] model returned: name="${toolCall.name}", args=${JSON.stringify(toolCall.arguments)}`);

    const config: IntegrationConfig = {
      client: makeRealBehalfIDClient(),
      agentId: process.env.BEHALFID_AGENT_ID!,
    };
    const execute = vi.fn().mockResolvedValue({ sent: true, to: toolCall.arguments.channel });

    const result = await checkToolCall(
      config,
      toolCall,
      execute,
      { resource: ALLOWED_RESOURCE }
    );

    expect(result.blocked).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
    console.log(`[runtime/openai/live] PASS — real BehalfID allowed, execute ran, requestId=${result.requestId}`);
  });

  it("denied purchase through real BehalfID, execute never runs", async () => {
    const { run, reason } = shouldRun();
    if (!run) { console.log(`[runtime/openai/live] SKIP — ${reason}`); return; }
    if (!behalfidAvailable()) { console.log("[runtime/openai/live] SKIP — BEHALFID_* vars missing"); return; }

    const config: IntegrationConfig = {
      client: makeRealBehalfIDClient(),
      agentId: process.env.BEHALFID_AGENT_ID!,
    };
    const execute = vi.fn();

    const result = await checkPurchase(config, { vendor: "evil.example", amount: 999999, execute });

    expect(result.blocked).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    console.log(`[runtime/openai/live] PASS — real BehalfID denied purchase, execute blocked, requestId=${result.requestId}`);
  });
});
