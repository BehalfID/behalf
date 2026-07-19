import { type McpAuditFinding, type McpAuditSeverity } from "./types.js";
/**
 * Calculates an overall security score from findings.
 *
 * Starts at 100 and deducts weighted points per finding severity.
 * The result is clamped to [0, 100].
 */
export declare class ScoreCalculator {
    private readonly weights;
    constructor(weights?: Readonly<Record<McpAuditSeverity, number>>);
    calculate(findings: readonly McpAuditFinding[]): number;
}
