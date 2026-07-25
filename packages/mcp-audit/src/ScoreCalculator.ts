import {
  SEVERITY_SCORE_WEIGHTS,
  type McpAuditFinding,
  type McpAuditSeverity,
} from "./types.js";

/**
 * Calculates an overall security score from findings.
 *
 * Starts at 100 and deducts weighted points per finding severity.
 * The result is clamped to [0, 100].
 */
export class ScoreCalculator {
  constructor(
    private readonly weights: Readonly<Record<McpAuditSeverity, number>> = SEVERITY_SCORE_WEIGHTS
  ) {}

  calculate(findings: readonly McpAuditFinding[]): number {
    let score = 100;
    for (const finding of findings) {
      score -= this.weights[finding.severity] ?? 0;
    }
    return clamp(score, 0, 100);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
