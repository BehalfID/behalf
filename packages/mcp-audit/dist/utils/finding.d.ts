import type { BehalfIdAction, McpAuditCategory, McpAuditFinding, McpAuditSeverity } from "../types.js";
/** Reset the finding id counter (for deterministic tests). */
export declare function resetFindingIdCounter(): void;
export type FindingInput = {
    ruleId: string;
    category: McpAuditCategory;
    severity: McpAuditSeverity;
    title: string;
    description: string;
    evidence: string[];
    serverName?: string;
    toolName?: string;
    remediation?: string;
    action?: BehalfIdAction;
};
/** Build a finding with a stable unique id. */
export declare function createFinding(input: FindingInput): McpAuditFinding;
/** Config path helper for evidence strings. */
export declare function configEvidence(sourcePath: string | undefined, serverName: string, field?: string): string;
