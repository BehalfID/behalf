import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
/**
 * Detects unrestricted outbound requests, remote fetch capability,
 * HTTP clients, and arbitrary URL access.
 *
 * Category: network-access
 */
export declare class NetworkAccessRule implements AuditRule {
    readonly id = "network-access";
    readonly name = "Network Access";
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
}
