import type { PermissionEngine } from "../PermissionEngine.js";
import { derivePermission } from "../permissions/match.js";
import type { Policy, PolicyContext, PolicyResult } from "../types.js";

/**
 * Deny when an explicit deny permission matches.
 */
export class DenyPermissionPolicy implements Policy {
  readonly id = "deny-permission";
  readonly name = "Deny Permission";
  readonly priority = 10;

  constructor(private readonly permissions: PermissionEngine) {}

  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    const action =
      context.execution.invocation.permission ??
      derivePermission(
        context.execution.invocation.server,
        context.execution.invocation.tool
      );

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
export class AllowPermissionPolicy implements Policy {
  readonly id = "allow-permission";
  readonly name = "Allow Permission";
  readonly priority = 50;

  constructor(private readonly permissions: PermissionEngine) {}

  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    const action =
      context.execution.invocation.permission ??
      derivePermission(
        context.execution.invocation.server,
        context.execution.invocation.tool
      );

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
export class BlockedServerPolicy implements Policy {
  readonly id = "blocked-server";
  readonly name = "Blocked Server";
  readonly priority = 5;

  constructor(private readonly blocked: ReadonlySet<string>) {}

  evaluate(context: PolicyContext): PolicyResult {
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
export class HighRiskApprovalPolicy implements Policy {
  readonly id = "high-risk-approval";
  readonly name = "High Risk Approval";
  readonly priority = 40;

  private readonly patterns: RegExp[];

  constructor(
    patterns: RegExp[] = [
      /^shell\./,
      /^filesystem\.(write|delete)/,
      /^git\.push$/,
      /^http\.request$/,
    ]
  ) {
    this.patterns = patterns;
  }

  evaluate(context: PolicyContext): PolicyResult {
    const action =
      context.execution.invocation.permission ??
      derivePermission(
        context.execution.invocation.server,
        context.execution.invocation.tool
      );

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
export class DenyByDefaultPolicy implements Policy {
  readonly id = "deny-by-default";
  readonly name = "Deny By Default";
  readonly priority = 1000;

  evaluate(_context: PolicyContext): PolicyResult {
    return {
      policyId: this.id,
      verdict: "deny",
      reason: "Denied by default (fail-closed)",
      definitive: false,
    };
  }
}

export function createDefaultPolicies(
  permissions: PermissionEngine,
  options: { blockedServers?: string[] } = {}
): Policy[] {
  const blocked = new Set(
    (options.blockedServers ?? []).map((s) => s.toLowerCase())
  );
  return [
    new BlockedServerPolicy(blocked),
    new DenyPermissionPolicy(permissions),
    new HighRiskApprovalPolicy(),
    new AllowPermissionPolicy(permissions),
    new DenyByDefaultPolicy(),
  ];
}
