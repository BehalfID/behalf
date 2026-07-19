import { describe, expect, it, beforeEach } from "vitest";
import {
  ApprovalEngine,
  AuditLogger,
  BehalfRuntime,
  DecisionEngine,
  EventBus,
  HeuristicRiskScorer,
  InMemoryApprovalStore,
  InMemoryAuditStore,
  InMemoryPermissionStore,
  PermissionEngine,
  PolicyEngine,
  PolicyRegistry,
  RiskEngine,
  ToolProxy,
  createDefaultPolicies,
  createId,
  derivePermission,
  hashArguments,
  matchAction,
  matchResource,
  permissionApplies,
  redactDeep,
  type McpTransport,
  type Policy,
  type RuntimeDecision,
  type RuntimeEvent,
  type ToolInvocation,
} from "../packages/mcp-runtime/src/index";

function invocation(
  overrides: Partial<ToolInvocation> = {}
): ToolInvocation {
  return {
    sessionId: "sess_1",
    userId: "user_1",
    workspaceId: "ws_1",
    server: "filesystem",
    tool: "read_file",
    permission: "filesystem.read",
    arguments: { path: "/tmp/a.txt" },
    ...overrides,
  };
}

function memoryTransport(
  impl?: McpTransport["callTool"]
): McpTransport {
  return {
    callTool:
      impl ??
      (async (server, tool, args) => ({
        data: { server, tool, args },
      })),
  };
}

describe("permission matching", () => {
  it("matches exact, wildcard segment, and full wildcard actions", () => {
    expect(matchAction("filesystem.read", "filesystem.read")).toBe(true);
    expect(matchAction("filesystem.*", "filesystem.write")).toBe(true);
    expect(matchAction("filesystem.*", "shell.execute")).toBe(false);
    expect(matchAction("*", "shell.execute")).toBe(true);
  });

  it("matches scoped resources with trailing wildcard", () => {
    expect(matchResource("/tmp/*", "/tmp/a.txt")).toBe(true);
    expect(matchResource("/tmp/*", "/var/a.txt")).toBe(false);
    expect(matchResource(undefined, "/tmp/a.txt")).toBe(true);
  });

  it("evaluates scoped permissions with expiration", () => {
    const expired = permissionApplies(
      {
        id: "p1",
        action: "filesystem.read",
        effect: "allow",
        resource: "/tmp/*",
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
      { action: "filesystem.read", resource: "/tmp/a.txt" }
    );
    expect(expired).toBe(false);

    const ok = permissionApplies(
      {
        id: "p2",
        action: "filesystem.read",
        effect: "allow",
        resource: "/tmp/*",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      { action: "filesystem.read", resource: "/tmp/a.txt" }
    );
    expect(ok).toBe(true);
  });

  it("derives logical permissions from tool names", () => {
    expect(derivePermission("shell", "run_command")).toBe("shell.execute");
    expect(derivePermission("fs", "write_file")).toBe("filesystem.write");
    expect(derivePermission("web", "fetch_url")).toBe("http.request");
  });
});

describe("PermissionEngine", () => {
  let engine: PermissionEngine;

  beforeEach(() => {
    engine = new PermissionEngine(new InMemoryPermissionStore());
  });

  it("allows matching grants and prefers deny over allow", async () => {
    await engine.grant({
      id: "allow-fs",
      action: "filesystem.*",
      effect: "allow",
      subjectId: "user_1",
    });
    await engine.grant({
      id: "deny-delete",
      action: "filesystem.delete",
      effect: "deny",
      subjectId: "user_1",
    });

    const allow = await engine.evaluate({
      action: "filesystem.read",
      subjectId: "user_1",
    });
    expect(allow.effect).toBe("allow");

    const deny = await engine.evaluate({
      action: "filesystem.delete",
      subjectId: "user_1",
    });
    expect(deny.effect).toBe("deny");
  });

  it("supports wildcard permissions", async () => {
    await engine.grant({
      id: "all",
      action: "*",
      effect: "allow",
      subjectId: "user_1",
    });
    const result = await engine.evaluate({
      action: "git.push",
      subjectId: "user_1",
    });
    expect(result.effect).toBe("allow");
  });
});

describe("policy matching and conflicts", () => {
  it("denies blocked servers definitively", async () => {
    const permissions = new PermissionEngine(new InMemoryPermissionStore());
    const registry = PolicyRegistry.empty().registerAll(
      createDefaultPolicies(permissions, { blockedServers: ["evil"] })
    );
    const engine = new PolicyEngine(registry);
    const runtime = new BehalfRuntime({
      permissionEngine: permissions,
      policyRegistry: registry,
      policyEngine: engine,
      dedupeRequests: false,
    });

    const decision = await runtime.evaluate(
      invocation({ server: "evil", tool: "x", permission: "filesystem.read" })
    );
    expect(decision.type).toBe("block-server");
    expect(decision.allowed).toBe(false);
  });

  it("allows when permission grants and denies when deny rules match", async () => {
    const runtime = new BehalfRuntime({ dedupeRequests: false });
    await runtime.grantPermission({
      id: "a1",
      action: "filesystem.read",
      effect: "allow",
      subjectId: "user_1",
    });

    const allowed = await runtime.evaluate(invocation());
    expect(allowed.allowed).toBe(true);

    await runtime.grantPermission({
      id: "d1",
      action: "filesystem.read",
      effect: "deny",
      subjectId: "user_1",
    });

    const denied = await runtime.evaluate(
      invocation({ requestId: createId("req") })
    );
    expect(denied.type).toBe("deny");
  });

  it("resolves policy conflicts: allow permission overrides soft require-approval", async () => {
    const runtime = new BehalfRuntime({ dedupeRequests: false });
    await runtime.grantPermission({
      id: "shell",
      action: "shell.execute",
      effect: "allow",
      subjectId: "user_1",
    });

    const decision = await runtime.evaluate(
      invocation({
        server: "shell",
        tool: "run",
        permission: "shell.execute",
      })
    );
    expect(decision.allowed).toBe(true);
  });

  it("registers custom policies without runtime changes", async () => {
    const permissions = new PermissionEngine(new InMemoryPermissionStore());
    const custom: Policy = {
      id: "custom-deny-tool",
      name: "Custom",
      priority: 1,
      evaluate(ctx) {
        if (ctx.execution.invocation.tool === "boom") {
          return {
            policyId: "custom-deny-tool",
            verdict: "deny",
            reason: "custom",
            definitive: true,
          };
        }
        return { policyId: "custom-deny-tool", verdict: "abstain", reason: "n/a" };
      },
    };

    const registry = PolicyRegistry.empty()
      .registerAll(createDefaultPolicies(permissions))
      .register(custom);

    const runtime = new BehalfRuntime({
      permissionEngine: permissions,
      policyRegistry: registry,
      dedupeRequests: false,
    });

    const decision = await runtime.evaluate(
      invocation({ tool: "boom", permission: "filesystem.read" })
    );
    expect(decision.type).toBe("deny");
    expect(decision.policyMatched).toBe("custom-deny-tool");
  });
});

describe("approval flow", () => {
  it("requires approval for high-risk tools without a grant", async () => {
    const runtime = new BehalfRuntime({ dedupeRequests: false });
    const decision = await runtime.evaluate(
      invocation({
        server: "shell",
        tool: "exec",
        permission: "shell.execute",
        arguments: { command: "npm install" },
      })
    );

    expect(decision.type).toBe("require-approval");
    expect(decision.approvalId).toBeTruthy();
  });

  it("supports approve-once, always-allow, and deny", async () => {
    const runtime = new BehalfRuntime({ dedupeRequests: false });
    const inv = invocation({
      requestId: "req_shell_1",
      server: "shell",
      tool: "exec",
      permission: "shell.execute",
    });

    const pending = await runtime.evaluate(inv);
    expect(pending.type).toBe("require-approval");

    const denied = await runtime.resolveApproval(
      { approvalId: pending.approvalId!, choice: "deny" },
      inv
    );
    expect(denied.type).toBe("deny");

    const inv2 = invocation({
      requestId: "req_shell_2",
      server: "shell",
      tool: "exec",
      permission: "shell.execute",
    });
    const pending2 = await runtime.evaluate(inv2);
    const once = await runtime.resolveApproval(
      { approvalId: pending2.approvalId!, choice: "approve-once" },
      inv2
    );
    expect(once.allowed).toBe(true);

    const inv3 = invocation({
      requestId: "req_shell_3",
      server: "shell",
      tool: "exec",
      permission: "shell.execute",
    });
    const pending3 = await runtime.evaluate(inv3);
    expect(pending3.type).toBe("require-approval");

    const always = await runtime.resolveApproval(
      { approvalId: pending3.approvalId!, choice: "always-allow" },
      inv3
    );
    expect(always.allowed).toBe(true);

    const inv4 = invocation({
      requestId: "req_shell_4",
      server: "shell",
      tool: "exec",
      permission: "shell.execute",
    });
    const reused = await runtime.evaluate(inv4);
    expect(reused.allowed).toBe(true);
  });
});

describe("risk scoring", () => {
  it("scores shell higher than filesystem read", () => {
    const engine = new RiskEngine([new HeuristicRiskScorer()]);
    const low = engine.assess({
      requestId: "r1",
      startedAt: new Date().toISOString(),
      argumentsHash: "abc",
      invocation: invocation(),
      session: {
        sessionId: "s",
        userId: "u",
        priorActions: [],
      },
    }, "filesystem.read");

    const high = engine.assess({
      requestId: "r2",
      startedAt: new Date().toISOString(),
      argumentsHash: "abc",
      invocation: invocation({
        server: "shell",
        tool: "exec",
        permission: "shell.execute",
        arguments: { command: "rm -rf /" },
      }),
      session: {
        sessionId: "s",
        userId: "u",
        priorActions: [],
      },
    }, "shell.execute");

    expect(low.level === "low" || low.level === "medium").toBe(true);
    expect(high.score).toBeGreaterThan(low.score);
    expect(["high", "critical"]).toContain(high.level);
  });
});

describe("audit event generation", () => {
  it("logs decisions with hashed arguments and without secrets", async () => {
    const store = new InMemoryAuditStore();
    const runtime = new BehalfRuntime({
      auditStore: store,
      dedupeRequests: false,
    });
    await runtime.grantPermission({
      id: "a1",
      action: "filesystem.read",
      effect: "allow",
      subjectId: "user_1",
    });

    const secret = "sk-super-secret-value-do-not-leak-999";
    await runtime.evaluate(
      invocation({
        arguments: { path: "/tmp/a", apiKey: secret },
      })
    );

    const events = await runtime.audit.list({ sessionId: "sess_1" });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const blob = JSON.stringify(events);
    expect(blob).not.toContain(secret);
    expect(events[0]!.argumentsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(events[0]!.decision).toBeTruthy();
  });

  it("redacts credentials before hashing", () => {
    const a = hashArguments({ token: "sk-abcdefghijklmnopqrstuvwxyz", path: "/x" });
    const b = hashArguments({ token: "sk-completely-different-secret-zzz", path: "/x" });
    // Both tokens redact to the same placeholder → identical hashes
    expect(a).toBe(b);
    expect(redactDeep({ password: "hunter2", ok: true })).toEqual({
      password: "[redacted]",
      ok: true,
    });
  });
});

describe("decision engine", () => {
  it("maps abstain to deny (fail-closed)", () => {
    const engine = new DecisionEngine();
    const decision = engine.decide({
      requestId: "r1",
      policy: {
        verdict: "abstain",
        reason: "none",
        results: [],
      },
      risk: { level: "low", score: 1, factors: [] },
    });
    expect(decision.type).toBe("deny");
    expect(decision.allowed).toBe(false);
  });
});

describe("tool proxy", () => {
  it("refuses execution unless allowed and does not mutate args by default", async () => {
    const calls: unknown[] = [];
    const proxy = new ToolProxy({
      transport: {
        async callTool(server, tool, args) {
          calls.push({ server, tool, args });
          return { data: "ok" };
        },
      },
    });

    const deny: RuntimeDecision = {
      type: "deny",
      requestId: "r1",
      reason: "no",
      risk: "high",
      riskScore: 80,
      allowed: false,
      evaluatedAt: new Date().toISOString(),
    };
    const refused = await proxy.execute(invocation(), deny);
    expect(refused.ok).toBe(false);
    expect(calls).toHaveLength(0);

    const allow: RuntimeDecision = {
      ...deny,
      type: "allow",
      allowed: true,
    };
    const args = { path: "/tmp/a.txt" };
    const ok = await proxy.execute(invocation({ arguments: args }), allow);
    expect(ok.ok).toBe(true);
    expect(calls[0]).toMatchObject({ args });
  });
});

describe("BehalfRuntime orchestration", () => {
  it("evaluateAndExecute runs the proxy on allow", async () => {
    const runtime = new BehalfRuntime({
      transport: memoryTransport(),
      dedupeRequests: false,
    });
    await runtime.grantPermission({
      id: "a1",
      action: "filesystem.read",
      effect: "allow",
      subjectId: "user_1",
    });

    const { decision, result } = await runtime.evaluateAndExecute(invocation());
    expect(decision.allowed).toBe(true);
    expect(result?.ok).toBe(true);
  });

  it("deduplicates identical request ids", async () => {
    const runtime = new BehalfRuntime({ dedupeRequests: true });
    await runtime.grantPermission({
      id: "a1",
      action: "filesystem.read",
      effect: "allow",
      subjectId: "user_1",
    });

    const a = await runtime.evaluate(invocation({ requestId: "dup_1" }));
    const b = await runtime.evaluate(invocation({ requestId: "dup_1" }));
    expect(a).toEqual(b);
  });

  it("handles concurrent distinct requests", async () => {
    const runtime = new BehalfRuntime({
      transport: memoryTransport(),
      dedupeRequests: true,
    });
    await runtime.grantPermission({
      id: "a1",
      action: "filesystem.read",
      effect: "allow",
      subjectId: "user_1",
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        runtime.evaluate(invocation({ requestId: `c_${i}` }))
      )
    );
    expect(results.every((r) => r.allowed)).toBe(true);
    expect(new Set(results.map((r) => r.requestId)).size).toBe(20);
  });

  it("emits lifecycle events", async () => {
    const bus = new EventBus();
    const seen: RuntimeEventType[] = [];
    bus.on("*", (e) => {
      seen.push(e.type);
    });

    const runtime = new BehalfRuntime({
      eventBus: bus,
      dedupeRequests: false,
    });
    await runtime.grantPermission({
      id: "a1",
      action: "filesystem.read",
      effect: "allow",
      subjectId: "user_1",
    });
    await runtime.evaluate(invocation({ requestId: "evt_1" }));

    expect(seen).toContain("request.received");
    expect(seen).toContain("policy.evaluated");
  });
});

type RuntimeEventType = RuntimeEvent["type"];

describe("ApprovalEngine state machine", () => {
  it("rejects double resolution", async () => {
    const engine = new ApprovalEngine(new InMemoryApprovalStore());
    const runtimeLike = {
      requestId: "r1",
      startedAt: new Date().toISOString(),
      argumentsHash: "h",
      invocation: invocation({ requestId: "r1" }),
      session: {
        sessionId: "sess_1",
        userId: "user_1",
        priorActions: [],
      },
    };

    const req = await engine.requestApproval({
      execution: runtimeLike,
      reason: "test",
      risk: "high",
      permission: "shell.execute",
    });

    await engine.resolve({ approvalId: req.id, choice: "approve-once" });
    await expect(
      engine.resolve({ approvalId: req.id, choice: "deny" })
    ).rejects.toThrow(/already/);
  });
});

describe("AuditLogger immutability", () => {
  it("appends events that list can retrieve", async () => {
    const logger = new AuditLogger(new InMemoryAuditStore());
    await logger.log({
      requestId: "r1",
      sessionId: "s1",
      userId: "u1",
      server: "fs",
      tool: "read",
      argumentsHash: "abc",
      decision: "allow",
      risk: "low",
      approvalRequired: false,
      reason: "ok",
    });
    const list = await logger.list({ requestId: "r1" });
    expect(list).toHaveLength(1);
    expect(list[0]!.server).toBe("fs");
  });
});
