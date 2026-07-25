import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
/**
 * Detects servers requesting unrestricted filesystem access, home directory
 * access, or recursive directory access.
 *
 * Category: filesystem-access
 */
export declare class FilesystemAccessRule implements AuditRule {
    readonly id = "filesystem-access";
    readonly name = "Filesystem Access";
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
}
