import type { AuditContext, AuditRule, McpAuditFinding } from "./types.js";
import type { RuleRegistry } from "./RuleRegistry.js";

/**
 * Executes every registered {@link AuditRule} and aggregates findings.
 *
 * Rules run sequentially to keep results deterministic. Failures in a single
 * rule are surfaced as configuration findings rather than aborting the audit.
 */
export class RuleEngine {
  constructor(private readonly registry: RuleRegistry) {}

  async execute(context: AuditContext): Promise<McpAuditFinding[]> {
    const findings: McpAuditFinding[] = [];

    for (const rule of this.registry.list()) {
      try {
        const ruleFindings = await rule.execute(context);
        findings.push(...ruleFindings);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        findings.push({
          id: `rule-error:${rule.id}`,
          ruleId: "configuration-issues",
          category: "configuration",
          severity: "medium",
          title: `Audit rule failed: ${rule.name}`,
          description:
            `Rule "${rule.id}" threw during execution. The rest of the audit continued.`,
          evidence: [`rule.id=${rule.id}`, `error=${message}`],
          remediation: "Fix the rule implementation or the input configuration that triggered the error.",
        });
      }
    }

    return findings;
  }
}
