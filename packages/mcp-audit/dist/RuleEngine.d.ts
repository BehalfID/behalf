import type { AuditContext, McpAuditFinding } from "./types.js";
import type { RuleRegistry } from "./RuleRegistry.js";
/**
 * Executes every registered {@link AuditRule} and aggregates findings.
 *
 * Rules run sequentially to keep results deterministic. Failures in a single
 * rule are surfaced as configuration findings rather than aborting the audit.
 */
export declare class RuleEngine {
    private readonly registry;
    constructor(registry: RuleRegistry);
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
}
