import { EventBus } from "./EventBus.js";
import type { ApprovalWaiter, McpInvocation, McpTransport, RuntimeExecuteResult, VerifyClient } from "./types.js";
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
export declare class McpRuntime {
    private readonly verifyClient;
    private readonly proxy;
    private readonly events;
    private readonly agentId?;
    private readonly waitForApproval?;
    /** Counts verify() calls — used by tests to prove every invocation verifies. */
    private verifyCallCount;
    constructor(options: McpRuntimeOptions);
    get eventBus(): EventBus;
    /** Test helper: number of verify() attempts in this process lifetime. */
    getVerifyCallCount(): number;
    /**
     * Authorize then (if allowed) execute the MCP tool.
     * Never executes when verification is unavailable, malformed, denied, or pending without approval.
     */
    execute(invocation: McpInvocation): Promise<RuntimeExecuteResult>;
    private verifyInvocation;
    private handleApprovalRequired;
    private executeAuthorized;
    private blockOnVerifyFailure;
}
