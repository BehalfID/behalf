import { describe, expect, it, vi } from "vitest";
import {
  EventBus,
  McpRuntime,
  mapInvocationToVerifyRequest,
  isValidVerifyDecision,
  type McpInvocation,
  type McpTransport,
  type RuntimeEventType,
  type VerifyClient,
  type VerifyDecision,
} from "../packages/mcp-runtime/src/index";

function inv(overrides: Partial<McpInvocation> = {}): McpInvocation {
  return {
    requestId: "req_1",
    sessionId: "sess_1",
    userId: "user_1",
    agentId: "agent_1",
    provider: "cursor",
    server: "filesystem",
    tool: "read_file",
    arguments: { path: "/tmp/a.txt" },
    metadata: { cwd: "/project" },
    ...overrides,
  };
}

function allowDecision(overrides: Partial<VerifyDecision> = {}): VerifyDecision {
  return {
    requestId: "v_1",
    allowed: true,
    reason: "allowed",
    risk: "low",
    ...overrides,
  };
}

function denyDecision(overrides: Partial<VerifyDecision> = {}): VerifyDecision {
  return {
    requestId: "v_2",
    allowed: false,
    reason: "denied by policy",
    risk: "high",
    ...overrides,
  };
}

function recordingTransport(): {
  transport: McpTransport;
  calls: Array<{ server: string; tool: string; args: unknown }>;
} {
  const calls: Array<{ server: string; tool: string; args: unknown }> = [];
  return {
    calls,
    transport: {
      async callTool(server, tool, args) {
        calls.push({ server, tool, args });
        return { data: { ok: true } };
      },
    },
  };
}

function client(impl: VerifyClient["verify"]): VerifyClient {
  return { verify: impl };
}

describe("mapInvocationToVerifyRequest", () => {
  it("maps server/tool/args into action, resource, and policyContext", () => {
    const input = mapInvocationToVerifyRequest(
      inv({
        arguments: { path: "/tmp/x", command: "ls" },
      })
    );
    expect(input.agentId).toBe("agent_1");
    expect(input.action).toBe("mcp_tool");
    expect(input.resource).toBe("mcp:filesystem:read_file");
    expect(input.vendor).toBe("filesystem");
    expect(input.policyContext?.toolName).toBe("filesystem/read_file");
    expect(input.policyContext?.toolInput?.filePath).toBe("/tmp/x");
    expect(input.policyContext?.toolInput?.command).toBe("ls");
    expect(input.metadata?.provider).toBe("cursor");
  });
});

describe("isValidVerifyDecision", () => {
  it("rejects malformed verification responses", () => {
    expect(isValidVerifyDecision(null)).toBe(false);
    expect(isValidVerifyDecision({ allowed: true })).toBe(false);
    expect(
      isValidVerifyDecision({
        requestId: "r",
        allowed: true,
        reason: "ok",
        risk: "critical",
      })
    ).toBe(false);
    expect(isValidVerifyDecision(allowDecision())).toBe(true);
  });
});

describe("McpRuntime PEP", () => {
  it("1. allowed request reaches the MCP server", async () => {
    const { transport, calls } = recordingTransport();
    const verify = vi.fn(async () => allowDecision());
    const runtime = new McpRuntime({
      verifyClient: client(verify),
      transport,
    });

    const result = await runtime.execute(inv());
    expect(result.outcome).toBe("allowed");
    expect(result.execution?.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      server: "filesystem",
      tool: "read_file",
    });
  });

  it("2. denied request never reaches the MCP server", async () => {
    const { transport, calls } = recordingTransport();
    const runtime = new McpRuntime({
      verifyClient: client(async () => denyDecision()),
      transport,
    });

    const result = await runtime.execute(inv());
    expect(result.outcome).toBe("denied");
    expect(calls).toHaveLength(0);
    expect(result.execution).toBeUndefined();
  });

  it("3. approval pauses execution until approved, then re-verifies", async () => {
    const { transport, calls } = recordingTransport();
    let phase = 0;
    const verify = vi.fn(async (): Promise<VerifyDecision> => {
      phase += 1;
      if (phase === 1) {
        return denyDecision({
          approvalRequired: true,
          approvalId: "appr_1",
          reason: "needs approval",
          risk: "medium",
        });
      }
      return allowDecision({ requestId: "v_after_approval" });
    });

    const waitForApproval = vi.fn(async () => "granted" as const);

    const runtime = new McpRuntime({
      verifyClient: client(verify),
      transport,
      waitForApproval,
    });

    const result = await runtime.execute(inv());
    expect(waitForApproval).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: "appr_1" })
    );
    expect(verify).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe("allowed");
    expect(calls).toHaveLength(1);
  });

  it("3b. approval denial never reaches the MCP server", async () => {
    const { transport, calls } = recordingTransport();
    const runtime = new McpRuntime({
      verifyClient: client(async () =>
        denyDecision({
          approvalRequired: true,
          approvalId: "appr_2",
          risk: "medium",
        })
      ),
      transport,
      waitForApproval: async () => "denied",
    });

    const result = await runtime.execute(inv());
    expect(result.outcome).toBe("approval-denied");
    expect(calls).toHaveLength(0);
  });

  it("4. verification timeout blocks execution", async () => {
    const { transport, calls } = recordingTransport();
    const runtime = new McpRuntime({
      verifyTimeoutMs: 30,
      verifyClient: client(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(allowDecision()), 500);
          })
      ),
      transport,
    });

    const result = await runtime.execute(inv());
    expect(result.outcome).toBe("verify-timeout");
    expect(calls).toHaveLength(0);
  });

  it("5. verification failure blocks execution", async () => {
    const { transport, calls } = recordingTransport();
    const runtime = new McpRuntime({
      verifyClient: client(async () => {
        throw new Error("network down");
      }),
      transport,
    });

    const result = await runtime.execute(inv());
    expect(result.outcome).toBe("verify-unavailable");
    expect(calls).toHaveLength(0);
  });

  it("6. malformed verification response blocks execution", async () => {
    const { transport, calls } = recordingTransport();
    const runtime = new McpRuntime({
      verifyClient: client(async () => ({ allowed: true }) as never),
      transport,
    });

    const result = await runtime.execute(inv());
    expect(result.outcome).toBe("verify-malformed");
    expect(calls).toHaveLength(0);
  });

  it("7. transport errors produce completion/failure events", async () => {
    const events: RuntimeEventType[] = [];
    const bus = new EventBus();
    bus.on("*", (e) => {
      events.push(e.type);
    });

    const runtime = new McpRuntime({
      verifyClient: client(async () => allowDecision()),
      eventBus: bus,
      transport: {
        async callTool() {
          throw new Error("stdio broken");
        },
      },
    });

    const result = await runtime.execute(inv());
    expect(result.outcome).toBe("allowed");
    expect(result.execution?.ok).toBe(false);
    expect(result.execution?.error).toMatch(/stdio broken/);
    expect(events).toContain("execution.started");
    expect(events).toContain("execution.failed");
  });

  it("8. execution receipts are emitted on success", async () => {
    const receipts: unknown[] = [];
    const bus = new EventBus();
    bus.on("execution.completed", (e) => {
      receipts.push((e.payload as { receipt: unknown }).receipt);
    });

    const runtime = new McpRuntime({
      verifyClient: client(async () => allowDecision()),
      eventBus: bus,
      transport: recordingTransport().transport,
    });

    await runtime.execute(inv({ requestId: "req_receipt" }));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      requestId: "req_receipt",
      success: true,
      server: "filesystem",
      tool: "read_file",
    });
  });

  it("9. every invocation passes through the verification client", async () => {
    const { transport } = recordingTransport();
    const verify = vi.fn(async () => allowDecision());
    const runtime = new McpRuntime({
      verifyClient: client(verify),
      transport,
    });

    await runtime.execute(inv({ requestId: "a" }));
    await runtime.execute(inv({ requestId: "b" }));
    await runtime.execute(inv({ requestId: "c" }));

    expect(verify).toHaveBeenCalledTimes(3);
    expect(runtime.getVerifyCallCount()).toBe(3);
  });

  it("10. no MCP tool executes before authorization succeeds", async () => {
    const order: string[] = [];
    const runtime = new McpRuntime({
      verifyClient: client(async () => {
        order.push("verify");
        return allowDecision();
      }),
      transport: {
        async callTool() {
          order.push("transport");
          return { data: true };
        },
      },
    });

    await runtime.execute(inv());
    expect(order).toEqual(["verify", "transport"]);
  });

  it("emits denial lifecycle when blocked", async () => {
    const events: RuntimeEventType[] = [];
    const bus = new EventBus();
    bus.on("*", (e) => events.push(e.type));

    const runtime = new McpRuntime({
      verifyClient: client(async () => denyDecision()),
      eventBus: bus,
      transport: recordingTransport().transport,
    });

    await runtime.execute(inv());
    expect(events).toContain("invocation.received");
    expect(events).toContain("verification.started");
    expect(events).toContain("verification.completed");
    expect(events).toContain("verification.denied");
    expect(events).not.toContain("execution.started");
  });
});
