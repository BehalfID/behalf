import type {
  McpInvocation,
  McpTransport,
  VerifyClient,
  VerifyDecision,
  VerifyRequest,
} from "../../src/types.js";

/** Build a well-formed allow decision. */
export function allowDecision(
  overrides: Partial<VerifyDecision> = {},
): VerifyDecision {
  return {
    requestId: "req_allow",
    allowed: true,
    reason: "permitted by policy",
    risk: "low",
    ...overrides,
  };
}

/** Build a well-formed deny decision. */
export function denyDecision(
  overrides: Partial<VerifyDecision> = {},
): VerifyDecision {
  return {
    requestId: "req_deny",
    allowed: false,
    reason: "no matching permission",
    risk: "high",
    ...overrides,
  };
}

/** Build a well-formed approval-required decision. */
export function approvalRequiredDecision(
  overrides: Partial<VerifyDecision> = {},
): VerifyDecision {
  return {
    requestId: "req_approval",
    allowed: false,
    reason: "approval required",
    risk: "medium",
    approvalRequired: true,
    approvalId: "apr_123",
    ...overrides,
  };
}

export type VerifyStep =
  | VerifyDecision
  | { throws: Error }
  | { raw: unknown }
  | { hangs: true };

/**
 * Scripted VerifyClient. Each `verify()` consumes the next step; the final step
 * repeats once the script is exhausted so polling loops stay deterministic.
 */
export class ScriptedVerifyClient implements VerifyClient {
  readonly requests: VerifyRequest[] = [];
  private index = 0;

  constructor(private readonly steps: VerifyStep[]) {
    if (steps.length === 0) {
      throw new Error("ScriptedVerifyClient requires at least one step");
    }
  }

  get callCount(): number {
    return this.requests.length;
  }

  async verify(input: VerifyRequest): Promise<VerifyDecision> {
    this.requests.push(structuredClone(input));
    const step = this.steps[Math.min(this.index, this.steps.length - 1)]!;
    this.index += 1;

    if (isThrows(step)) {
      throw step.throws;
    }
    if (isHangs(step)) {
      // Never settles — exercises the fail-closed verify deadline.
      return new Promise<VerifyDecision>(() => {});
    }
    if (isRaw(step)) {
      return step.raw as VerifyDecision;
    }
    return step;
  }
}

function isThrows(step: VerifyStep): step is { throws: Error } {
  return typeof step === "object" && step !== null && "throws" in step;
}

function isHangs(step: VerifyStep): step is { hangs: true } {
  return typeof step === "object" && step !== null && "hangs" in step;
}

function isRaw(step: VerifyStep): step is { raw: unknown } {
  return typeof step === "object" && step !== null && "raw" in step;
}

export type TransportCall = {
  server: string;
  tool: string;
  args?: unknown;
};

/**
 * Records every downstream tool dispatch so tests can assert that blocked
 * invocations never reach the downstream MCP server.
 */
export class RecordingTransport implements McpTransport {
  readonly calls: TransportCall[] = [];

  constructor(
    private readonly responder: (
      call: TransportCall,
    ) => Promise<{ data?: unknown; error?: string }> = async () => ({
      data: { content: [{ type: "text", text: "ok" }] },
    }),
  ) {}

  get callCount(): number {
    return this.calls.length;
  }

  async callTool(
    server: string,
    tool: string,
    args?: unknown,
  ): Promise<{ data?: unknown; error?: string }> {
    const call: TransportCall = { server, tool, args };
    this.calls.push(call);
    return this.responder(call);
  }
}

/** Build a canonical MCP invocation for runtime tests. */
export function invocation(
  overrides: Partial<McpInvocation> = {},
): McpInvocation {
  return {
    requestId: "rq_1",
    sessionId: "sess_1",
    userId: "user_1",
    agentId: "agent_1",
    provider: "cursor",
    server: "filesystem",
    tool: "read_file",
    arguments: { path: "/tmp/example.txt" },
    metadata: { cwd: "/tmp" },
    ...overrides,
  };
}

/** Immediate-resolve sleep so polling loops run without real timers. */
export function instantSleep(): (ms: number) => Promise<void> {
  return async () => {};
}
