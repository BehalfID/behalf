import { describe, expect, it } from "vitest";
import { McpRuntime } from "../src/McpRuntime.js";
import { EventBus } from "../src/EventBus.js";
import type { ApprovalWaiter, RuntimeEvent } from "../src/types.js";
import {
  allowDecision,
  approvalRequiredDecision,
  denyDecision,
  invocation,
  RecordingTransport,
  ScriptedVerifyClient,
  type VerifyStep,
} from "./helpers/fakes.js";

function build(
  steps: VerifyStep[],
  options: {
    transport?: RecordingTransport;
    waitForApproval?: ApprovalWaiter;
    verifyTimeoutMs?: number;
  } = {},
) {
  const verifyClient = new ScriptedVerifyClient(steps);
  const transport = options.transport ?? new RecordingTransport();
  const eventBus = new EventBus();
  const events: RuntimeEvent[] = [];
  eventBus.on("*", (event) => {
    events.push(event);
  });

  const runtime = new McpRuntime({
    agentId: "agent_default",
    verifyClient,
    transport,
    eventBus,
    ...(options.verifyTimeoutMs !== undefined
      ? { verifyTimeoutMs: options.verifyTimeoutMs }
      : {}),
    ...(options.waitForApproval ? { waitForApproval: options.waitForApproval } : {}),
  });

  return {
    runtime,
    verifyClient,
    transport,
    events,
    eventTypes: () => events.map((event) => event.type),
  };
}

describe("McpRuntime — allow", () => {
  it("verifies then proxies the tool call downstream", async () => {
    const { runtime, verifyClient, transport, eventTypes } = build([
      allowDecision(),
    ]);

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("allowed");
    expect(result.execution?.ok).toBe(true);
    expect(verifyClient.callCount).toBe(1);
    expect(transport.calls).toEqual([
      {
        server: "filesystem",
        tool: "read_file",
        args: { path: "/tmp/example.txt" },
      },
    ]);
    expect(eventTypes()).toContain("execution.completed");
  });

  it("verifies before dispatching — never dispatches first", async () => {
    const order: string[] = [];
    const transport = new RecordingTransport(async () => {
      order.push("dispatch");
      return { data: { ok: true } };
    });
    const verifyClient = new ScriptedVerifyClient([allowDecision()]);
    const originalVerify = verifyClient.verify.bind(verifyClient);
    verifyClient.verify = async (input) => {
      order.push("verify");
      return originalVerify(input);
    };

    const runtime = new McpRuntime({
      agentId: "agent_default",
      verifyClient,
      transport,
    });
    await runtime.execute(invocation());

    expect(order).toEqual(["verify", "dispatch"]);
  });

  it("maps the invocation into a verify request without mutating arguments", async () => {
    const { runtime, verifyClient, transport } = build([allowDecision()]);
    const args = { path: "/etc/hosts", command: "cat /etc/hosts" };

    await runtime.execute(invocation({ arguments: args }));

    const request = verifyClient.requests[0]!;
    expect(request.agentId).toBe("agent_1");
    expect(request.action).toBe("mcp_tool");
    expect(request.resource).toBe("mcp:filesystem:read_file");
    expect(request.policyContext?.toolName).toBe("filesystem/read_file");
    expect(request.policyContext?.toolInput?.filePath).toBe("/etc/hosts");
    expect(request.policyContext?.toolInput?.command).toBe("cat /etc/hosts");
    // Arguments reach the downstream server byte-for-byte.
    expect(transport.calls[0]?.args).toEqual(args);
  });
});

describe("McpRuntime — deny", () => {
  it("blocks the tool call and never dispatches downstream", async () => {
    const { runtime, transport, eventTypes } = build([denyDecision()]);

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("denied");
    expect(result.error).toBe("no matching permission");
    expect(result.execution).toBeUndefined();
    expect(transport.callCount).toBe(0);
    expect(eventTypes()).toContain("verification.denied");
    expect(eventTypes()).not.toContain("execution.started");
  });
});

describe("McpRuntime — approval required", () => {
  it("fails closed when approval is required and no waiter is configured", async () => {
    const { runtime, transport, eventTypes } = build([approvalRequiredDecision()]);

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("denied");
    expect(result.decision?.approvalRequired).toBe(true);
    expect(transport.callCount).toBe(0);
    expect(eventTypes()).toContain("approval.required");
    expect(eventTypes()).toContain("verification.denied");
  });

  it("fails closed when approval is required but no approvalId is issued", async () => {
    const waiterCalls: number[] = [];
    const { runtime, transport } = build(
      [approvalRequiredDecision({ approvalId: undefined })],
      {
        waitForApproval: async () => {
          waiterCalls.push(1);
          return "granted";
        },
      },
    );

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("denied");
    expect(waiterCalls).toHaveLength(0);
    expect(transport.callCount).toBe(0);
  });
});

describe("McpRuntime — approval granted", () => {
  it("re-verifies after a bare grant so the platform consumes the one-shot approval", async () => {
    const { runtime, verifyClient, transport, eventTypes } = build(
      [approvalRequiredDecision(), allowDecision({ requestId: "req_resumed" })],
      { waitForApproval: async () => "granted" },
    );

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("allowed");
    expect(result.decision?.requestId).toBe("req_resumed");
    // Two verify() calls: initial decision plus the grant-consuming re-verify.
    expect(verifyClient.callCount).toBe(2);
    expect(transport.callCount).toBe(1);
    expect(eventTypes()).toContain("approval.granted");
  });

  it("reuses a waiter-supplied allowed decision without double-consuming the grant", async () => {
    const resumed = allowDecision({ requestId: "req_from_waiter" });
    const { runtime, verifyClient, transport } = build(
      [approvalRequiredDecision()],
      {
        waitForApproval: async () => ({ granted: true, decision: resumed }),
      },
    );

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("allowed");
    expect(result.decision?.requestId).toBe("req_from_waiter");
    expect(verifyClient.callCount).toBe(1);
    expect(transport.callCount).toBe(1);
  });

  it("fails closed when the post-approval re-verify comes back denied", async () => {
    const { runtime, transport } = build(
      [approvalRequiredDecision(), denyDecision({ reason: "approval expired" })],
      { waitForApproval: async () => "granted" },
    );

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("denied");
    expect(result.error).toBe("approval expired");
    expect(transport.callCount).toBe(0);
  });

  it("fails closed when the post-approval re-verify cannot reach BehalfID", async () => {
    const { runtime, transport } = build(
      [
        approvalRequiredDecision(),
        { throws: new Error("getaddrinfo ENOTFOUND behalfid.com") },
      ],
      { waitForApproval: async () => "granted" },
    );

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("verify-unavailable");
    expect(transport.callCount).toBe(0);
  });
});

describe("McpRuntime — approval denied", () => {
  it("blocks the tool call when the approver denies", async () => {
    const { runtime, verifyClient, transport, eventTypes } = build(
      [approvalRequiredDecision()],
      { waitForApproval: async () => "denied" },
    );

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("approval-denied");
    expect(result.error).toBe("Approval denied");
    expect(transport.callCount).toBe(0);
    expect(verifyClient.callCount).toBe(1);
    expect(eventTypes()).toContain("approval.denied");
    expect(eventTypes()).not.toContain("execution.started");
  });
});

describe("McpRuntime — approval timeout", () => {
  it("treats a waiter timeout as denial and never dispatches", async () => {
    // The shipped polling waiter returns "denied" when its deadline passes.
    const { runtime, transport } = build([approvalRequiredDecision()], {
      waitForApproval: async () => "denied",
    });

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("approval-denied");
    expect(transport.callCount).toBe(0);
  });

  it("propagates a waiter crash as a blocked invocation", async () => {
    const { runtime, transport } = build([approvalRequiredDecision()], {
      waitForApproval: async () => {
        throw new Error("approval channel unavailable");
      },
    });

    await expect(runtime.execute(invocation())).rejects.toThrow(
      "approval channel unavailable",
    );
    expect(transport.callCount).toBe(0);
  });
});

describe("McpRuntime — malformed verification responses", () => {
  const malformed: Array<[string, unknown]> = [
    ["null", null],
    ["a string", "allowed"],
    ["an array", []],
    ["missing requestId", { allowed: true, reason: "ok", risk: "low" }],
    ["empty requestId", { requestId: "", allowed: true, reason: "ok", risk: "low" }],
    [
      "allowed as a string",
      { requestId: "r", allowed: "true", reason: "ok", risk: "low" },
    ],
    ["missing reason", { requestId: "r", allowed: true, risk: "low" }],
    [
      "unknown risk level",
      { requestId: "r", allowed: true, reason: "ok", risk: "catastrophic" },
    ],
    [
      "non-boolean approvalRequired",
      {
        requestId: "r",
        allowed: false,
        reason: "ok",
        risk: "low",
        approvalRequired: "yes",
      },
    ],
    [
      "non-string approvalId",
      {
        requestId: "r",
        allowed: false,
        reason: "ok",
        risk: "low",
        approvalRequired: true,
        approvalId: 42,
      },
    ],
  ];

  for (const [label, raw] of malformed) {
    it(`fails closed when verify returns ${label}`, async () => {
      const { runtime, transport } = build([{ raw }]);

      const result = await runtime.execute(invocation());

      expect(result.outcome).toBe("verify-malformed");
      expect(transport.callCount).toBe(0);
    });
  }

  it("does not treat a truthy-looking malformed payload as an allow", async () => {
    const { runtime, transport } = build([
      { raw: { allowed: true, allow: true, ok: true } },
    ]);

    const result = await runtime.execute(invocation());

    expect(result.outcome).not.toBe("allowed");
    expect(transport.callCount).toBe(0);
  });
});

describe("McpRuntime — BehalfID network outage", () => {
  it("fails closed on connection refused", async () => {
    const { runtime, transport, eventTypes } = build([
      { throws: new Error("connect ECONNREFUSED 127.0.0.1:443") },
    ]);

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("verify-unavailable");
    expect(result.error).toContain("ECONNREFUSED");
    expect(transport.callCount).toBe(0);
    expect(eventTypes()).toContain("verification.denied");
  });

  it("fails closed on DNS failure", async () => {
    const { runtime, transport } = build([
      { throws: new Error("getaddrinfo EAI_AGAIN behalfid.com") },
    ]);

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("verify-unavailable");
    expect(transport.callCount).toBe(0);
  });

  it("fails closed on HTTP 5xx from the verify endpoint", async () => {
    const { runtime, transport } = build([
      { throws: new Error("Verify HTTP 503: upstream unavailable") },
    ]);

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("verify-unavailable");
    expect(transport.callCount).toBe(0);
  });

  it("fails closed when verify never responds within the deadline", async () => {
    const { runtime, transport } = build([{ hangs: true }], {
      verifyTimeoutMs: 25,
    });

    const result = await runtime.execute(invocation());

    expect(result.outcome).toBe("verify-timeout");
    expect(result.error).toContain("timeout");
    expect(transport.callCount).toBe(0);
  });
});

describe("McpRuntime — downstream server failures", () => {
  it("reports a downstream error without claiming the tool succeeded", async () => {
    const transport = new RecordingTransport(async () => ({
      error: "Downstream MCP stdio closed",
    }));
    const { runtime, eventTypes } = build([allowDecision()], { transport });

    const result = await runtime.execute(invocation());

    // Authorization succeeded; execution did not.
    expect(result.outcome).toBe("allowed");
    expect(result.execution?.ok).toBe(false);
    expect(result.execution?.error).toBe("Downstream MCP stdio closed");
    expect(eventTypes()).toContain("execution.failed");
    expect(eventTypes()).not.toContain("execution.completed");
  });

  it("captures a thrown downstream transport error", async () => {
    const transport = new RecordingTransport(async () => {
      throw new Error("child process exited with code 1");
    });
    const { runtime } = build([allowDecision()], { transport });

    const result = await runtime.execute(invocation());

    expect(result.execution?.ok).toBe(false);
    expect(result.execution?.error).toBe("child process exited with code 1");
  });

  it("still requires verification for a retry after a downstream crash", async () => {
    let attempts = 0;
    const transport = new RecordingTransport(async () => {
      attempts += 1;
      return attempts === 1
        ? { error: "Downstream MCP timeout on tools/call" }
        : { data: { content: [{ type: "text", text: "recovered" }] } };
    });
    const { runtime, verifyClient } = build([allowDecision()], { transport });

    const first = await runtime.execute(invocation());
    const second = await runtime.execute(invocation());

    expect(first.execution?.ok).toBe(false);
    expect(second.execution?.ok).toBe(true);
    expect(verifyClient.callCount).toBe(2);
  });
});

describe("McpRuntime — duplicate and replayed requests", () => {
  it("re-verifies every invocation instead of caching a prior allow", async () => {
    const { runtime, verifyClient, transport } = build([allowDecision()]);
    const replayed = invocation({ requestId: "rq_fixed" });

    await runtime.execute(replayed);
    await runtime.execute(replayed);
    await runtime.execute(replayed);

    expect(verifyClient.callCount).toBe(3);
    expect(runtime.getVerifyCallCount()).toBe(3);
    expect(transport.callCount).toBe(3);
  });

  it("honours a revoked decision on replay of an identical request", async () => {
    const { runtime, transport } = build([
      allowDecision(),
      denyDecision({ reason: "permission revoked" }),
    ]);
    const replayed = invocation({ requestId: "rq_fixed" });

    const first = await runtime.execute(replayed);
    const second = await runtime.execute(replayed);

    expect(first.outcome).toBe("allowed");
    expect(second.outcome).toBe("denied");
    expect(second.error).toBe("permission revoked");
    // The replay was blocked, so only the first call reached downstream.
    expect(transport.callCount).toBe(1);
  });

  it("does not reuse a consumed approval grant for a replayed request", async () => {
    const { runtime, transport } = build(
      [
        approvalRequiredDecision(),
        allowDecision({ requestId: "req_resumed" }),
        approvalRequiredDecision({ requestId: "req_approval_2" }),
        denyDecision({ reason: "approval already consumed" }),
      ],
      { waitForApproval: async () => "granted" },
    );
    const replayed = invocation({ requestId: "rq_fixed" });

    const first = await runtime.execute(replayed);
    const second = await runtime.execute(replayed);

    expect(first.outcome).toBe("allowed");
    expect(second.outcome).toBe("denied");
    expect(transport.callCount).toBe(1);
  });

  it("keeps concurrent duplicate invocations independently authorized", async () => {
    const { runtime, verifyClient, transport } = build([allowDecision()]);
    const replayed = invocation({ requestId: "rq_fixed" });

    await Promise.all([
      runtime.execute(replayed),
      runtime.execute(replayed),
      runtime.execute(replayed),
    ]);

    expect(verifyClient.callCount).toBe(3);
    expect(transport.callCount).toBe(3);
  });
});

describe("McpRuntime — construction guards", () => {
  it("refuses to construct without a verify client", () => {
    expect(
      () =>
        new McpRuntime({
          transport: new RecordingTransport(),
        } as unknown as ConstructorParameters<typeof McpRuntime>[0]),
    ).toThrow("requires a verifyClient");
  });

  it("refuses to construct without a transport", () => {
    expect(
      () =>
        new McpRuntime({
          verifyClient: new ScriptedVerifyClient([allowDecision()]),
        } as unknown as ConstructorParameters<typeof McpRuntime>[0]),
    ).toThrow("requires a transport");
  });

  it("fails closed when no agent id can be resolved for verify", async () => {
    const verifyClient = new ScriptedVerifyClient([allowDecision()]);
    const transport = new RecordingTransport();
    const runtime = new McpRuntime({ verifyClient, transport });

    const result = await runtime.execute(
      invocation({ agentId: undefined }),
    );

    expect(result.outcome).toBe("verify-unavailable");
    expect(result.error).toContain("missing agentId");
    expect(verifyClient.callCount).toBe(0);
    expect(transport.callCount).toBe(0);
  });
});
