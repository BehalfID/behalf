import { ApprovalEngine, type ApprovalStore } from "./ApprovalEngine.js";
import { AuditLogger, type AuditStore } from "./AuditLogger.js";
import { DecisionEngine } from "./DecisionEngine.js";
import { EventBus } from "./EventBus.js";
import { PermissionEngine, type PermissionStore } from "./PermissionEngine.js";
import { PolicyEngine } from "./PolicyEngine.js";
import { PolicyRegistry } from "./PolicyRegistry.js";
import { RiskEngine } from "./RiskEngine.js";
import { ToolProxy } from "./ToolProxy.js";
import type { ApprovalResolution, McpTransport, Permission, RuntimeDecision, ToolExecutionResult, ToolInvocation } from "./types.js";
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
/**
 * Central Runtime Engine.
 *
 * Validates the request, builds an execution context, runs policy → risk →
 * approval → decision → audit, and optionally proxies the tool call.
 */
export declare class BehalfRuntime {
    readonly permissions: PermissionEngine;
    readonly approvals: ApprovalEngine;
    readonly audit: AuditLogger;
    readonly events: EventBus;
    readonly policies: PolicyEngine;
    readonly registry: PolicyRegistry;
    readonly risk: RiskEngine;
    readonly decisions: DecisionEngine;
    readonly proxy?: ToolProxy;
    private readonly sessions;
    private readonly decisionCache;
    private readonly inFlight;
    private readonly dedupeRequests;
    constructor(options?: BehalfRuntimeOptions);
    /** Grant a permission into the permission engine. */
    grantPermission(permission: Permission): Promise<void>;
    /**
     * Evaluate a tool invocation and return allow / deny / require-approval.
     * Does not execute the tool.
     */
    evaluate(invocation: ToolInvocation): Promise<RuntimeDecision>;
    /**
     * Resolve a pending approval and re-evaluate the associated request.
     */
    resolveApproval(resolution: ApprovalResolution, invocation: ToolInvocation): Promise<RuntimeDecision>;
    /**
     * Evaluate then execute through the tool proxy when allowed.
     */
    evaluateAndExecute(invocation: ToolInvocation): Promise<{
        decision: RuntimeDecision;
        result?: ToolExecutionResult;
    }>;
    private evaluateInternal;
    private createContext;
    private recordPrior;
}
