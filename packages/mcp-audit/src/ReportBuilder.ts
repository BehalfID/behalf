import {
  SEVERITY_RANK,
  type McpAuditCategory,
  type McpAuditConfiguration,
  type McpAuditFinding,
  type McpAuditReport,
  type McpAuditSeverity,
  type McpAuditedServer,
  type McpAuditSummary,
} from "./types.js";
import type { ScoreCalculator } from "./ScoreCalculator.js";

/**
 * Assembles a complete {@link McpAuditReport} from findings and configuration.
 */
export class ReportBuilder {
  constructor(private readonly scoreCalculator: ScoreCalculator) {}

  build(
    configuration: McpAuditConfiguration,
    findings: readonly McpAuditFinding[],
    generatedAt: string
  ): McpAuditReport {
    const deduped = dedupeFindings(findings);
    const summary = this.buildSummary(configuration, deduped);
    const servers = this.buildServers(configuration, deduped);

    return {
      generatedAt,
      summary,
      findings: deduped,
      servers,
    };
  }

  private buildSummary(
    configuration: McpAuditConfiguration,
    findings: readonly McpAuditFinding[]
  ): McpAuditSummary {
    const bySeverity: Record<McpAuditSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    const byCategory: Partial<Record<McpAuditCategory, number>> = {};

    for (const finding of findings) {
      bySeverity[finding.severity] += 1;
      byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
    }

    return {
      securityScore: this.scoreCalculator.calculate(findings),
      totalFindings: findings.length,
      bySeverity,
      byCategory,
      serverCount: configuration.servers.length,
    };
  }

  private buildServers(
    configuration: McpAuditConfiguration,
    findings: readonly McpAuditFinding[]
  ): McpAuditedServer[] {
    const trustedSet = new Set(
      (configuration.trustedServers ?? []).map((n) => n.toLowerCase())
    );

    return configuration.servers.map((server) => {
      const serverFindings = findings.filter((f) => f.serverName === server.name);
      const trusted =
        server.trusted === true ||
        server.approved === true ||
        trustedSet.has(server.name.toLowerCase());

      return {
        name: server.name,
        trusted,
        toolCount: server.tools?.length ?? 0,
        findingCount: serverFindings.length,
        riskLevel: highestSeverity(serverFindings),
      };
    });
  }
}

function highestSeverity(
  findings: readonly McpAuditFinding[]
): McpAuditSeverity | "none" {
  if (findings.length === 0) return "none";
  let best: McpAuditSeverity = findings[0]!.severity;
  for (const finding of findings) {
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[best]) {
      best = finding.severity;
    }
  }
  return best;
}

/**
 * Deduplicate findings that share the same rule, server, tool, and title.
 * Evidence from duplicates is merged so nothing is lost.
 */
function dedupeFindings(findings: readonly McpAuditFinding[]): McpAuditFinding[] {
  const map = new Map<string, McpAuditFinding>();

  for (const finding of findings) {
    const key = [
      finding.ruleId,
      finding.serverName ?? "",
      finding.toolName ?? "",
      finding.title,
      finding.category,
    ].join("|");

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...finding, evidence: [...finding.evidence] });
      continue;
    }

    const evidence = new Set([...existing.evidence, ...finding.evidence]);
    map.set(key, { ...existing, evidence: [...evidence] });
  }

  return [...map.values()];
}
