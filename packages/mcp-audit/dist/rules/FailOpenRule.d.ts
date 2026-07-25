import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
/**
 * Detects configurations that default to allowing actions when policy
 * evaluation fails (fail-open posture).
 *
 * Severity: critical
 * Category: fail-open
 */
export declare class FailOpenRule implements AuditRule {
    readonly id = "fail-open";
    readonly name = "Fail Open";
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
}
