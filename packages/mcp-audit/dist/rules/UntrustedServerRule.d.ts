import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
/**
 * Detects MCP servers that are not on the trusted / approved allow-list.
 *
 * Severity: high
 * Category: untrusted-server
 */
export declare class UntrustedServerRule implements AuditRule {
    readonly id = "untrusted-server";
    readonly name = "Untrusted Server";
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
}
