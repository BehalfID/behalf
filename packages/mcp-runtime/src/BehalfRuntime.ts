import { ApprovalEngine, type ApprovalStore, InMemoryApprovalStore } from "./ApprovalEngine.js";
import { AuditLogger, type AuditStore, InMemoryAuditStore } from "./AuditLogger.js";
import { DecisionEngine } from "./DecisionEngine.js";
import { EventBus } from "./EventBus.js";
import {
  InMemoryPermissionStore,
  PermissionEngine,
  type PermissionStore,
} from "./PermissionEngine.js";
import { PolicyEngine } from "./PolicyEngine.js";
import { PolicyRegistry } from "./PolicyRegistry.js";
import { createDefaultPolicies } from "./policies/index.js";
import { derivePermission } from "./permissions/match.js";
import { RiskEngine } from "./RiskEngine.js";
import { ToolProxy } from "./ToolProxy.js";
import { createId, hashArguments } from "./utils/hash.js";
import type {
  ApprovalResolution,
  ExecutionContext,
  McpTransport,
  Permission,
  PriorAction,
  RuntimeDecision,
  ToolExecutionResult,
  ToolInvocation,
} from "./types.js";

export type BehalfRuntimeOptions = {
  policyEngine?: PolicyEngine;
  policyRegistry?: PolicyRegistry;
  permissionEngine?: PermissionEngine;
  permissionStore?: PermissionStore;
  approvalEngine?: ApprovalEngine;
  approvalStore?: ApprovalStore;
  auditLogger?: AuditLogger;
  auditStore?: AuditStore;
  riskEngine?: RiskEngine;
  decisionEngine?: DecisionEngine;
  eventBus?: EventBus;
  /** Optional transport — required for evaluateAndExecute / proxy.execute. */
  transport?: McpTransport;
  toolProxy?: ToolProxy;
  blockedServers?: string[];
  /** When set, duplicate requestIds return the cached decision. */
  dedupeRequests?: boolean;
};

type SessionState = {
  priorActions: PriorAction[];
};

/**
 * Central Runtime Engine.
 *
 * Validates the request, builds an execution context, runs policy → risk →
 * approval → decision → audit, and optionally proxies the tool call.
 */
export class BehalfRuntime {
  readonly permissions: PermissionEngine;
  readonly approvals: ApprovalEngine;
  readonly audit: AuditLogger;
  readonly events: EventBus;
  readonly policies: PolicyEngine;
  readonly registry: PolicyRegistry;
  readonly risk: RiskEngine;
  readonly decisions: DecisionEngine;
  readonly proxy?: ToolProxy;

  private readonly sessions = new Map<string, SessionState>();
  private readonly decisionCache = new Map<string, RuntimeDecision>();
  private readonly inFlight = new Map<string, Promise<RuntimeDecision>>();
  private readonly dedupeRequests: boolean;

  constructor(options: BehalfRuntimeOptions = {}) {
    const permissionStore = options.permissionStore ?? new InMemoryPermissionStore();
    this.permissions =
      options.permissionEngine ?? new PermissionEngine(permissionStore);

    const approvalStore = options.approvalStore ?? new InMemoryApprovalStore();
    this.approvals = options.approvalEngine ?? new ApprovalEngine(approvalStore);

    const auditStore = options.auditStore ?? new InMemoryAuditStore();
    this.audit = options.auditLogger ?? new AuditLogger(auditStore);

    this.events = options.eventBus ?? new EventBus();
    this.risk = options.riskEngine ?? new RiskEngine();
    this.decisions = options.decisionEngine ?? new DecisionEngine();
    this.dedupeRequests = options.dedupeRequests !== false;

    this.registry =
      options.policyRegistry ??
      PolicyRegistry.empty().registerAll(
        createDefaultPolicies(this.permissions, {
          blockedServers: options.blockedServers,
        })
      );

    this.policies = options.policyEngine ?? new PolicyEngine(this.registry);

    if (options.toolProxy) {
      this.proxy = options.toolProxy;
    } else if (options.transport) {
      this.proxy = new ToolProxy({ transport: options.transport });
    }
  }

  /** Grant a permission into the permission engine. */
  async grantPermission(permission: Permission): Promise<void> {
    await this.permissions.grant(permission);
  }

  /**
   * Evaluate a tool invocation and return allow / deny / require-approval.
   * Does not execute the tool.
   */
  async evaluate(invocation: ToolInvocation): Promise<RuntimeDecision> {
    const requestId = invocation.requestId ?? createId("req");
    const normalized: ToolInvocation = { ...invocation, requestId };

    if (this.dedupeRequests) {
      const cached = this.decisionCache.get(requestId);
      if (cached) return cached;

      const pending = this.inFlight.get(requestId);
      if (pending) return pending;
    }

    const work = this.evaluateInternal(normalized);
    if (this.dedupeRequests) {
      this.inFlight.set(requestId, work);
    }

    try {
      const decision = await work;
      if (this.dedupeRequests) {
        this.decisionCache.set(requestId, decision);
      }
      return decision;
    } finally {
      this.inFlight.delete(requestId);
    }
  }

  /**
   * Resolve a pending approval and re-evaluate the associated request.
   */
  async resolveApproval(
    resolution: ApprovalResolution,
    invocation: ToolInvocation
  ): Promise<RuntimeDecision> {
    const updated = await this.approvals.resolve(resolution);

    if (updated.choice === "deny") {
      await this.events.emit(
        "approval.denied",
        { approval: updated },
        updated.requestId
      );
    } else {
      await this.events.emit(
        "approval.granted",
        { approval: updated },
        updated.requestId
      );
    }

    // Clear cache so re-evaluation picks up the resolution
    this.decisionCache.delete(updated.requestId);
    const withId: ToolInvocation = {
      ...invocation,
      requestId: updated.requestId,
    };
    return this.evaluate(withId);
  }

  /**
   * Evaluate then execute through the tool proxy when allowed.
   */
  async evaluateAndExecute(
    invocation: ToolInvocation
  ): Promise<{ decision: RuntimeDecision; result?: ToolExecutionResult }> {
    const decision = await this.evaluate(invocation);
    if (!decision.allowed) {
      return { decision };
    }
    if (!this.proxy) {
      throw new Error("No tool proxy / transport configured");
    }

    await this.events.emit(
      "tool.started",
      { invocation, decision },
      decision.requestId
    );

    const result = await this.proxy.execute(
      { ...invocation, requestId: decision.requestId },
      decision
    );

    await this.audit.log({
      requestId: decision.requestId,
      sessionId: invocation.sessionId,
      userId: invocation.userId,
      workspaceId: invocation.workspaceId,
      server: invocation.server,
      tool: invocation.tool,
      permission:
        invocation.permission ??
        derivePermission(invocation.server, invocation.tool),
      argumentsHash: hashArguments(invocation.arguments),
      decision: decision.type,
      risk: decision.risk,
      policyMatched: decision.policyMatched,
      approvalRequired: false,
      approvalId: decision.approvalId,
      reason: decision.reason,
      executionDurationMs: result.durationMs,
      result: result.ok ? "success" : "failure",
      error: result.error,
    });

    if (result.ok) {
      await this.events.emit(
        "tool.completed",
        { invocation, decision, result },
        decision.requestId
      );
    } else {
      await this.events.emit(
        "tool.failed",
        { invocation, decision, result },
        decision.requestId
      );
    }

    return { decision, result };
  }

  private async evaluateInternal(
    invocation: ToolInvocation
  ): Promise<RuntimeDecision> {
    const requestId = invocation.requestId!;
    await this.events.emit("request.received", { invocation }, requestId);

    const execution = this.createContext(invocation);
    const permission =
      invocation.permission ??
      derivePermission(invocation.server, invocation.tool);

    const perms = await this.permissions.list({
      subjectId: invocation.userId,
      workspaceId: invocation.workspaceId,
    });

    const policy = await this.policies.evaluate({
      execution,
      permissions: perms,
    });

    await this.events.emit(
      "policy.evaluated",
      { policy, requestId },
      requestId
    );

    const risk = this.risk.assess(execution, permission);

    let approval = await this.approvals.getByRequestId(requestId);

    if (!approval && policy.verdict === "require-approval") {
      approval = await this.approvals.requestApproval({
        execution,
        reason: policy.reason,
        risk: risk.level,
        permission,
      });

      if (approval.status === "pending") {
        await this.events.emit("approval.requested", { approval }, requestId);
      }
    }

    const blockServer = policy.matchedPolicyId === "blocked-server";

    const decision = this.decisions.decide({
      requestId,
      policy,
      risk,
      approval,
      blockServer,
    });

    await this.audit.log({
      requestId,
      sessionId: invocation.sessionId,
      userId: invocation.userId,
      workspaceId: invocation.workspaceId,
      server: invocation.server,
      tool: invocation.tool,
      permission,
      argumentsHash: execution.argumentsHash,
      decision: decision.type,
      risk: decision.risk,
      policyMatched: decision.policyMatched,
      approvalRequired: decision.type === "require-approval",
      approvalId: decision.approvalId,
      reason: decision.reason,
      result: "skipped",
    });

    this.recordPrior(invocation.sessionId, {
      server: invocation.server,
      tool: invocation.tool,
      permission,
      decision: decision.type,
      risk: decision.risk,
      at: decision.evaluatedAt,
    });

    if (!decision.allowed) {
      await this.events.emit(
        "request.denied",
        { decision, invocation },
        requestId
      );
    }

    return decision;
  }

  private createContext(invocation: ToolInvocation): ExecutionContext {
    const session = this.sessions.get(invocation.sessionId) ?? {
      priorActions: [],
    };
    if (!this.sessions.has(invocation.sessionId)) {
      this.sessions.set(invocation.sessionId, session);
    }

    return {
      requestId: invocation.requestId!,
      invocation,
      startedAt: new Date().toISOString(),
      argumentsHash: hashArguments(invocation.arguments),
      session: {
        sessionId: invocation.sessionId,
        userId: invocation.userId,
        workspaceId: invocation.workspaceId,
        priorActions: session.priorActions,
      },
    };
  }

  private recordPrior(sessionId: string, action: PriorAction): void {
    const session = this.sessions.get(sessionId) ?? { priorActions: [] };
    const next = [...session.priorActions, action].slice(-50);
    this.sessions.set(sessionId, { priorActions: next });
  }
}
