import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
/**
 * Detects duplicate servers, invalid configuration, missing required fields,
 * and malformed tool definitions.
 *
 * Category: configuration
 */
export declare class ConfigurationIssuesRule implements AuditRule {
    readonly id = "configuration-issues";
    readonly name = "Configuration Issues";
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
}
