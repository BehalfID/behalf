import { ReportBuilder } from "./ReportBuilder.js";
import { RuleEngine } from "./RuleEngine.js";
import { RuleRegistry } from "./RuleRegistry.js";
import { ScoreCalculator } from "./ScoreCalculator.js";
import { createDefaultRules } from "./rules/index.js";
import type {
  AuditContext,
  AuditRule,
  McpAuditConfiguration,
  McpAuditReport,
} from "./types.js";

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
export class AuditEngine {
  private readonly registry: RuleRegistry;
  private readonly ruleEngine: RuleEngine;
  private readonly reportBuilder: ReportBuilder;
  private readonly now: () => Date;

  constructor(options: AuditEngineOptions = {}) {
    this.registry = options.registry ?? createDefaultRegistry();
    this.ruleEngine = new RuleEngine(this.registry);
    const scoreCalculator = options.scoreCalculator ?? new ScoreCalculator();
    this.reportBuilder = new ReportBuilder(scoreCalculator);
    this.now = options.now ?? (() => new Date());
  }

  /** Registered rules available to this engine instance. */
  getRules(): AuditRule[] {
    return this.registry.list();
  }

  /**
   * Run a full audit against the given MCP configuration.
   */
  async audit(configuration: McpAuditConfiguration): Promise<McpAuditReport> {
    const startedAt = this.now().toISOString();
    const context: AuditContext = {
      configuration: freezeConfiguration(configuration),
      startedAt,
    };

    const findings = await this.ruleEngine.execute(context);
    return this.reportBuilder.build(configuration, findings, startedAt);
  }
}

/** Create a registry pre-loaded with the default rule set. */
export function createDefaultRegistry(): RuleRegistry {
  return RuleRegistry.empty().registerAll(createDefaultRules());
}

/**
 * Snapshot the configuration graph so rules cannot accidentally mutate
 * shared input. Returns a plain (mutable-typed) deep copy.
 */
function freezeConfiguration(
  configuration: McpAuditConfiguration
): McpAuditConfiguration {
  return structuredClone(configuration);
}
