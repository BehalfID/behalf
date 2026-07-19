import { type McpAuditConfiguration, type McpAuditFinding, type McpAuditReport } from "./types.js";
import type { ScoreCalculator } from "./ScoreCalculator.js";
/**
 * Assembles a complete {@link McpAuditReport} from findings and configuration.
 */
export declare class ReportBuilder {
    private readonly scoreCalculator;
    constructor(scoreCalculator: ScoreCalculator);
    build(configuration: McpAuditConfiguration, findings: readonly McpAuditFinding[], generatedAt: string): McpAuditReport;
    private buildSummary;
    private buildServers;
}
