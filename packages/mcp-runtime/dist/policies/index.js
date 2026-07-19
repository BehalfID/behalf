import { derivePermission } from "../permissions/match.js";
/**
 * Deny when an explicit deny permission matches.
 */
export class DenyPermissionPolicy {
    permissions;
    id = "deny-permission";
    name = "Deny Permission";
    priority = 10;
    constructor(permissions) {
        this.permissions = permissions;
    }
    async evaluate(context) {
        const action = context.execution.invocation.permission ??
            derivePermission(context.execution.invocation.server, context.execution.invocation.tool);
        const result = await this.permissions.evaluate({
            action,
            resource: context.execution.invocation.resource,
            server: context.execution.invocation.server,
            tool: context.execution.invocation.tool,
            subjectId: context.execution.session.userId,
            workspaceId: context.execution.session.workspaceId,
        });
        if (result.effect === "deny") {
            return {
                policyId: this.id,
                verdict: "deny",
                reason: result.reason,
                definitive: true,
            };
        }
        return { policyId: this.id, verdict: "abstain", reason: "No deny permission" };
    }
}
/**
 * Allow when an explicit allow permission matches (scoped / wildcard / exact).
 */
export class AllowPermissionPolicy {
    permissions;
    id = "allow-permission";
    name = "Allow Permission";
    priority = 50;
    constructor(permissions) {
        this.permissions = permissions;
    }
    async evaluate(context) {
        const action = context.execution.invocation.permission ??
            derivePermission(context.execution.invocation.server, context.execution.invocation.tool);
        const result = await this.permissions.evaluate({
            action,
            resource: context.execution.invocation.resource,
            server: context.execution.invocation.server,
            tool: context.execution.invocation.tool,
            subjectId: context.execution.session.userId,
            workspaceId: context.execution.session.workspaceId,
        });
        if (result.effect === "allow") {
            return {
                policyId: this.id,
                verdict: "allow",
                reason: result.reason,
            };
        }
        return {
            policyId: this.id,
            verdict: "abstain",
            reason: "No allow permission matched",
        };
    }
}
/**
 * Block entire MCP servers by name.
 */
export class BlockedServerPolicy {
    blocked;
    id = "blocked-server";
    name = "Blocked Server";
    priority = 5;
    constructor(blocked) {
        this.blocked = blocked;
    }
    evaluate(context) {
        const server = context.execution.invocation.server.toLowerCase();
        if (this.blocked.has(server)) {
            return {
                policyId: this.id,
                verdict: "deny",
                reason: `Server "${context.execution.invocation.server}" is blocked`,
                definitive: true,
            };
        }
        return { policyId: this.id, verdict: "abstain", reason: "Server not blocked" };
    }
}
/**
 * Require approval for high-risk permission families when not already granted.
 */
export class HighRiskApprovalPolicy {
    id = "high-risk-approval";
    name = "High Risk Approval";
    priority = 40;
    patterns;
    constructor(patterns = [
        /^shell\./,
        /^filesystem\.(write|delete)/,
        /^git\.push$/,
        /^http\.request$/,
    ]) {
        this.patterns = patterns;
    }
    evaluate(context) {
        const action = context.execution.invocation.permission ??
            derivePermission(context.execution.invocation.server, context.execution.invocation.tool);
        if (this.patterns.some((p) => p.test(action))) {
            return {
                policyId: this.id,
                verdict: "require-approval",
                reason: `High-risk action "${action}" requires approval`,
            };
        }
        return { policyId: this.id, verdict: "abstain", reason: "Not high-risk" };
    }
}
/**
 * Fail-closed default: if nothing else decided, deny.
 * Registered last so explicit allows can win first.
 */
export class DenyByDefaultPolicy {
    id = "deny-by-default";
    name = "Deny By Default";
    priority = 1000;
    evaluate(_context) {
        return {
            policyId: this.id,
            verdict: "deny",
            reason: "Denied by default (fail-closed)",
            definitive: false,
        };
    }
}
export function createDefaultPolicies(permissions, options = {}) {
    const blocked = new Set((options.blockedServers ?? []).map((s) => s.toLowerCase()));
    return [
        new BlockedServerPolicy(blocked),
        new DenyPermissionPolicy(permissions),
        new HighRiskApprovalPolicy(),
        new AllowPermissionPolicy(permissions),
        new DenyByDefaultPolicy(),
    ];
}
