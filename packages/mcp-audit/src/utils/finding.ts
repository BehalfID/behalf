import type {
  BehalfIdAction,
  McpAuditCategory,
  McpAuditFinding,
  McpAuditSeverity,
} from "../types.js";

let findingCounter = 0;

/** Reset the finding id counter (for deterministic tests). */
export function resetFindingIdCounter(): void {
  findingCounter = 0;
}

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
export function createFinding(input: FindingInput): McpAuditFinding {
  findingCounter += 1;
  const scope = [input.serverName, input.toolName].filter(Boolean).join(":");
  const id = `${input.ruleId}:${scope || "global"}:${findingCounter}`;

  return {
    id,
    ruleId: input.ruleId,
    category: input.category,
    severity: input.severity,
    title: input.title,
    description: input.description,
    evidence: [...input.evidence],
    serverName: input.serverName,
    toolName: input.toolName,
    remediation: input.remediation,
    action: input.action,
  };
}

/** Config path helper for evidence strings. */
export function configEvidence(
  sourcePath: string | undefined,
  serverName: string,
  field?: string
): string {
  const base = sourcePath ?? "mcpServers";
  const path = `${base}#mcpServers.${serverName}`;
  return field ? `${path}.${field}` : path;
}
