import { EventBus } from "./EventBus.js";
import { mapInvocationToVerifyRequest } from "./mapInvocation.js";
import { ToolProxy } from "./ToolProxy.js";
import {
  callVerify,
  VerifyMalformedError,
  VerifyTimeoutError,
  withVerifyTimeout,
} from "./verify.js";
import type {
  ApprovalWaiter,
  ExecutionReceipt,
  McpInvocation,
  McpTransport,
  RuntimeExecuteResult,
  RuntimeOutcome,
  VerifyClient,
  VerifyDecision,
} from "./types.js";

export type McpRuntimeOptions = {
  /** Platform verify client (SDK or HTTP). Sole authorization source. */
  verifyClient: VerifyClient;
  /** Downstream MCP transport. */
  transport: McpTransport;
  eventBus?: EventBus;
  /** Default agent id when invocation.agentId is omitted. */
  agentId?: string;
  /** Fail-closed deadline for verify(). */
  verifyTimeoutMs?: number;
  /**
   * Host hook to pause until the platform ApprovalRequest is resolved.
   * After "granted", the runtime re-calls verify() so the platform consumes the grant.
   */
  waitForApproval?: ApprovalWaiter;
};

/**
 * Policy Enforcement Point for MCP tool invocations.
 *
 * Intercept → map → verify() → enforce → proxy. No local policy, permission,
 * approval, risk, or audit engines.
 */
export class McpRuntime {
  private readonly verifyClient: VerifyClient;
  private readonly proxy: ToolProxy;
  private readonly events: EventBus;
  private readonly agentId?: string;
  private readonly waitForApproval?: ApprovalWaiter;
  /** Counts verify() calls — used by tests to prove every invocation verifies. */
  private verifyCallCount = 0;

  constructor(options: McpRuntimeOptions) {
    if (!options.verifyClient) {
      throw new Error("McpRuntime requires a verifyClient");
    }
    if (!options.transport) {
      throw new Error("McpRuntime requires a transport");
    }

    this.verifyClient =
      options.verifyTimeoutMs !== undefined
        ? withVerifyTimeout(options.verifyClient, options.verifyTimeoutMs)
        : options.verifyClient;
    this.proxy = new ToolProxy({ transport: options.transport });
    this.events = options.eventBus ?? new EventBus();
    this.agentId = options.agentId;
    this.waitForApproval = options.waitForApproval;
  }

  get eventBus(): EventBus {
    return this.events;
  }

  /** Test helper: number of verify() attempts in this process lifetime. */
  getVerifyCallCount(): number {
    return this.verifyCallCount;
  }

  /**
   * Authorize then (if allowed) execute the MCP tool.
   * Never executes when verification is unavailable, malformed, denied, or pending without approval.
   */
  async execute(invocation: McpInvocation): Promise<RuntimeExecuteResult> {
    await this.events.emit(
      "invocation.received",
      { invocation },
      invocation.requestId
    );

    let decision: VerifyDecision;
    try {
      decision = await this.verifyInvocation(invocation);
    } catch (err) {
      return this.blockOnVerifyFailure(invocation, err);
    }

    if (decision.approvalRequired && !decision.allowed) {
      return this.handleApprovalRequired(invocation, decision);
    }

    if (!decision.allowed) {
      await this.events.emit(
        "verification.denied",
        { invocation, decision },
        invocation.requestId
      );
      return {
        outcome: "denied",
        invocation,
        decision,
        error: decision.reason,
      };
    }

    return this.executeAuthorized(invocation, decision);
  }

  private async verifyInvocation(
    invocation: McpInvocation
  ): Promise<VerifyDecision> {
    const input = mapInvocationToVerifyRequest(invocation, this.agentId);
    await this.events.emit(
      "verification.started",
      { invocation, input },
      invocation.requestId
    );

    this.verifyCallCount += 1;
    const decision = await callVerify(this.verifyClient, input);

    await this.events.emit(
      "verification.completed",
      { invocation, decision },
      invocation.requestId
    );

    return decision;
  }

  private async handleApprovalRequired(
    invocation: McpInvocation,
    decision: VerifyDecision
  ): Promise<RuntimeExecuteResult> {
    const approvalId = decision.approvalId;
    await this.events.emit(
      "approval.required",
      { invocation, decision, approvalId },
      invocation.requestId
    );

    if (!approvalId || !this.waitForApproval) {
      await this.events.emit(
        "verification.denied",
        { invocation, decision, reason: "approval-required-without-waiter" },
        invocation.requestId
      );
      return {
        outcome: "denied",
        invocation,
        decision,
        error:
          decision.reason ||
          "Approval required but no waitForApproval handler is configured",
      };
    }

    const choice = await this.waitForApproval({
      approvalId,
      invocation,
      decision,
    });

    if (choice === "denied") {
      await this.events.emit(
        "approval.denied",
        { invocation, approvalId },
        invocation.requestId
      );
      return {
        outcome: "approval-denied",
        invocation,
        decision,
        error: "Approval denied",
      };
    }

    await this.events.emit(
      "approval.granted",
      { invocation, approvalId },
      invocation.requestId
    );

    // Re-verify so the platform consumes the one-shot approval grant.
    let resumed: VerifyDecision;
    try {
      resumed = await this.verifyInvocation(invocation);
    } catch (err) {
      return this.blockOnVerifyFailure(invocation, err);
    }

    if (!resumed.allowed) {
      await this.events.emit(
        "verification.denied",
        { invocation, decision: resumed },
        invocation.requestId
      );
      return {
        outcome: "denied",
        invocation,
        decision: resumed,
        error: resumed.reason,
      };
    }

    return this.executeAuthorized(invocation, resumed);
  }

  private async executeAuthorized(
    invocation: McpInvocation,
    decision: VerifyDecision
  ): Promise<RuntimeExecuteResult> {
    await this.events.emit(
      "execution.started",
      { invocation, decision },
      invocation.requestId
    );

    const execution = await this.proxy.execute(
      invocation.server,
      invocation.tool,
      invocation.arguments
    );

    const receipt: ExecutionReceipt = {
      requestId: invocation.requestId,
      success: execution.ok,
      durationMs: execution.durationMs,
      error: execution.error,
      server: invocation.server,
      tool: invocation.tool,
    };

    if (execution.ok) {
      await this.events.emit(
        "execution.completed",
        { invocation, decision, execution, receipt },
        invocation.requestId
      );
    } else {
      await this.events.emit(
        "execution.failed",
        { invocation, decision, execution, receipt },
        invocation.requestId
      );
    }

    return {
      outcome: "allowed",
      invocation,
      decision,
      execution,
    };
  }

  private async blockOnVerifyFailure(
    invocation: McpInvocation,
    err: unknown
  ): Promise<RuntimeExecuteResult> {
    const outcome: RuntimeOutcome =
      err instanceof VerifyTimeoutError
        ? "verify-timeout"
        : err instanceof VerifyMalformedError
          ? "verify-malformed"
          : "verify-unavailable";

    const error = err instanceof Error ? err.message : String(err);

    await this.events.emit(
      "verification.denied",
      { invocation, outcome, error },
      invocation.requestId
    );

    return { outcome, invocation, error };
  }
}
