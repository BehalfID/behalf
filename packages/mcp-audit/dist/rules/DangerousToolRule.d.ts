import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
/**
 * Identifies tools that appear capable of shell execution, terminal access,
 * arbitrary code execution, or process spawning.
 *
 * Category: dangerous-tool
 */
export declare class DangerousToolRule implements AuditRule {
    readonly id = "dangerous-tool";
    readonly name = "Dangerous Tool Detection";
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
    private serverCapabilityFinding;
}
