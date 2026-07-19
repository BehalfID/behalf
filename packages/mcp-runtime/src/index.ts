/**
 * @behalfid/mcp-runtime — BehalfID Runtime MCP Protection Framework
 *
 * Governs every MCP tool invocation before it reaches an MCP server.
 * Provider-agnostic authorization, approval, risk, audit, and proxy layer.
 */

export { BehalfRuntime } from "./BehalfRuntime.js";
export type { BehalfRuntimeOptions } from "./BehalfRuntime.js";

export { ToolProxy } from "./ToolProxy.js";
export type { ArgumentTransform, ToolProxyOptions } from "./ToolProxy.js";

export { PolicyEngine } from "./PolicyEngine.js";
export type { AggregatedPolicyResult } from "./PolicyEngine.js";
export { PolicyRegistry } from "./PolicyRegistry.js";

export {
  PermissionEngine,
  InMemoryPermissionStore,
} from "./PermissionEngine.js";
export type {
  PermissionStore,
  PermissionEvalResult,
} from "./PermissionEngine.js";

export {
  ApprovalEngine,
  InMemoryApprovalStore,
} from "./ApprovalEngine.js";
export type { ApprovalStore } from "./ApprovalEngine.js";

export { RiskEngine, HeuristicRiskScorer } from "./RiskEngine.js";
export { DecisionEngine } from "./DecisionEngine.js";
export type { DecisionInput } from "./DecisionEngine.js";

export { AuditLogger, InMemoryAuditStore } from "./AuditLogger.js";
export type { AuditStore } from "./AuditLogger.js";

export { EventBus } from "./EventBus.js";

export {
  createDefaultPolicies,
  AllowPermissionPolicy,
  DenyPermissionPolicy,
  BlockedServerPolicy,
  HighRiskApprovalPolicy,
  DenyByDefaultPolicy,
} from "./policies/index.js";

export {
  matchAction,
  matchResource,
  permissionApplies,
  isPermissionExpired,
  derivePermission,
} from "./permissions/match.js";

export { hashArguments, redactDeep, createId } from "./utils/hash.js";

export type {
  ApprovalChoice,
  ApprovalRequest,
  ApprovalResolution,
  ApprovalStatus,
  AuditEvent,
  DecisionType,
  ExecutionContext,
  McpTransport,
  Permission,
  PermissionEffect,
  Policy,
  PolicyContext,
  PolicyResult,
  PolicyVerdict,
  PriorAction,
  RiskAssessment,
  RiskLevel,
  RiskScorer,
  RuntimeDecision,
  RuntimeEvent,
  RuntimeEventHandler,
  RuntimeEventType,
  SessionInfo,
  ToolExecutionResult,
  ToolInvocation,
} from "./types.js";
