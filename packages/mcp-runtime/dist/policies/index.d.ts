import type { PermissionEngine } from "../PermissionEngine.js";
import type { Policy, PolicyContext, PolicyResult } from "../types.js";
/**
 * Deny when an explicit deny permission matches.
 */
export declare class DenyPermissionPolicy implements Policy {
    private readonly permissions;
    readonly id = "deny-permission";
    readonly name = "Deny Permission";
    readonly priority = 10;
    constructor(permissions: PermissionEngine);
    evaluate(context: PolicyContext): Promise<PolicyResult>;
}
/**
 * Allow when an explicit allow permission matches (scoped / wildcard / exact).
 */
export declare class AllowPermissionPolicy implements Policy {
    private readonly permissions;
    readonly id = "allow-permission";
    readonly name = "Allow Permission";
    readonly priority = 50;
    constructor(permissions: PermissionEngine);
    evaluate(context: PolicyContext): Promise<PolicyResult>;
}
/**
 * Block entire MCP servers by name.
 */
export declare class BlockedServerPolicy implements Policy {
    private readonly blocked;
    readonly id = "blocked-server";
    readonly name = "Blocked Server";
    readonly priority = 5;
    constructor(blocked: ReadonlySet<string>);
    evaluate(context: PolicyContext): PolicyResult;
}
/**
 * Require approval for high-risk permission families when not already granted.
 */
export declare class HighRiskApprovalPolicy implements Policy {
    readonly id = "high-risk-approval";
    readonly name = "High Risk Approval";
    readonly priority = 40;
    private readonly patterns;
    constructor(patterns?: RegExp[]);
    evaluate(context: PolicyContext): PolicyResult;
}
/**
 * Fail-closed default: if nothing else decided, deny.
 * Registered last so explicit allows can win first.
 */
export declare class DenyByDefaultPolicy implements Policy {
    readonly id = "deny-by-default";
    readonly name = "Deny By Default";
    readonly priority = 1000;
    evaluate(_context: PolicyContext): PolicyResult;
}
export declare function createDefaultPolicies(permissions: PermissionEngine, options?: {
    blockedServers?: string[];
}): Policy[];
