import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
/**
 * Detects configured policies that are never applied to any server.
 *
 * Category: unenforced-policy
 */
export declare class UnenforcedPolicyRule implements AuditRule {
    readonly id = "unenforced-policy";
    readonly name = "Unenforced Policy";
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
}
