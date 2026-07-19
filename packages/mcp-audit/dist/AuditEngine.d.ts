import { RuleRegistry } from "./RuleRegistry.js";
import { ScoreCalculator } from "./ScoreCalculator.js";
import type { AuditRule, McpAuditConfiguration, McpAuditReport } from "./types.js";
export type AuditEngineOptions = {
    /** Custom rule registry. Defaults to all built-in rules. */
    registry?: RuleRegistry;
    /** Override score weights / calculator. */
    scoreCalculator?: ScoreCalculator;
    /** Clock override for deterministic tests. */
    now?: () => Date;
};
/**
 * Top-level MCP auditing engine.
 *
 * Discovers configured servers from the provided configuration, runs every
 * registered security rule, aggregates findings, scores the result, and
 * returns a complete {@link McpAuditReport}.
 *
 * This engine is strictly read-only: it never modifies configuration files
 * and never executes MCP tools.
 */
export declare class AuditEngine {
    private readonly registry;
    private readonly ruleEngine;
    private readonly reportBuilder;
    private readonly now;
    constructor(options?: AuditEngineOptions);
    /** Registered rules available to this engine instance. */
    getRules(): AuditRule[];
    /**
     * Run a full audit against the given MCP configuration.
     */
    audit(configuration: McpAuditConfiguration): Promise<McpAuditReport>;
}
/** Create a registry pre-loaded with the default rule set. */
export declare function createDefaultRegistry(): RuleRegistry;
