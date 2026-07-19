import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
/**
 * Identifies tools that should require user approval but currently do not.
 *
 * Generates a BehalfID `require-approval` action with a draft payload.
 *
 * Category: missing-approval
 */
export declare class MissingApprovalRule implements AuditRule {
    readonly id = "missing-approval";
    readonly name = "Missing Approval";
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
}
