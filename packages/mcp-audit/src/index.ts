/**
 * @behalfid/mcp-audit — BehalfID MCP Auditing Engine
 *
 * Read-only security analysis of MCP server configurations.
 * Never modifies configuration files or executes MCP tools.
 */

export { AuditEngine, createDefaultRegistry } from "./AuditEngine.js";
export type { AuditEngineOptions } from "./AuditEngine.js";
export { RuleEngine } from "./RuleEngine.js";
export { RuleRegistry } from "./RuleRegistry.js";
export { ScoreCalculator } from "./ScoreCalculator.js";
export { ReportBuilder } from "./ReportBuilder.js";
export { normalizeMcpConfig } from "./normalize.js";
export { createDefaultRules } from "./rules/index.js";
export {
  ConfigurationIssuesRule,
  CredentialExposureRule,
  DangerousToolRule,
  FailOpenRule,
  FilesystemAccessRule,
  MissingApprovalRule,
  NetworkAccessRule,
  UnenforcedPolicyRule,
  UntrustedServerRule,
} from "./rules/index.js";
export { resetFindingIdCounter } from "./utils/finding.js";
export { detectCredentialKeys, redactCredentialValue } from "./utils/credentials.js";

export type {
  AuditContext,
  AuditRule,
  BehalfIdAction,
  BehalfIdActionType,
  McpAuditCategory,
  McpAuditConfiguration,
  McpAuditFinding,
  McpAuditReport,
  McpAuditSeverity,
  McpAuditSummary,
  McpAuditedServer,
  McpPolicyDefinition,
  McpServerCapabilities,
  McpServerConfig,
  McpToolDefinition,
} from "./types.js";

export { SEVERITY_RANK, SEVERITY_SCORE_WEIGHTS } from "./types.js";
