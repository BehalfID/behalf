/**
 * Public contracts for the BehalfID Runtime MCP Protection Framework.
 *
 * The runtime sits between AI agents and MCP servers. Every tool invocation
 * must receive a decision before it may reach the underlying server.
 */

// ─── Risk & decisions ────────────────────────────────────────────────────────

/** Calculated risk for a tool invocation. */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/**
 * Final outcomes from the Decision Engine.
 * No other module may invent alternate terminal outcomes.
 */
export type DecisionType =
  | "allow"
  | "allow-with-audit"
  | "require-approval"
  | "deny"
  | "block-server";

/** Intermediate verdict produced by a single policy. */
export type PolicyVerdict = "allow" | "deny" | "require-approval" | "abstain";

/** User response options for an interrupted approval. */
export type ApprovalChoice = "approve-once" | "always-allow" | "deny";

/** Lifecycle status of an approval request. */
export type ApprovalStatus =
  | "pending"
  | "approved-once"
  | "always-allowed"
  | "denied"
  | "expired";

// ─── Permissions ─────────────────────────────────────────────────────────────

/** Effect of a permission grant. */
export type PermissionEffect = "allow" | "deny";

/**
 * First-class permission object.
 *
 * Examples: `filesystem.read`, `shell.execute`, `http.request`, `git.push`
 */
export interface Permission {
  id: string;
  /** Dot-separated permission string, may include `*` wildcards. */
  action: string;
  effect: PermissionEffect;
  /** Optional resource scope (path, host, repo, etc.). Supports trailing `*`. */
  resource?: string;
  /** Optional MCP server scope. */
  server?: string;
  /** Optional MCP tool scope. */
  tool?: string;
  /** Subject this permission applies to (user, agent, role id). */
  subjectId?: string;
  workspaceId?: string;
  expiresAt?: string;
  /** Free-form notes for operators. */
  notes?: string;
}

// ─── Invocation & context ────────────────────────────────────────────────────

/**
 * An MCP tool invocation request entering the runtime.
 * Provider-agnostic: works for Cursor, Claude Desktop, VS Code, Windsurf, etc.
 */
export interface ToolInvocation {
  /** Caller-supplied or runtime-generated unique request id. */
  requestId?: string;
  sessionId: string;
  userId: string;
  workspaceId?: string;
  /** MCP server name. */
  server: string;
  /** MCP tool name. */
  tool: string;
  /** Tool arguments (never mutated by the runtime unless policy instructs). */
  arguments?: Record<string, unknown>;
  /**
   * Logical permission this tool maps to (e.g. `shell.execute`).
   * When omitted, the runtime derives one from server/tool heuristics.
   */
  permission?: string;
  /** Optional resource target (path, URL, repo). */
  resource?: string;
  metadata?: Record<string, unknown>;
}

/** Immutable execution context created for one evaluation. */
export interface ExecutionContext {
  requestId: string;
  invocation: Readonly<ToolInvocation>;
  startedAt: string;
  /** SHA-256 hash of redacted arguments — never raw secrets. */
  argumentsHash: string;
  session: SessionInfo;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  workspaceId?: string;
  /** Prior decisions in this session (newest last), for risk / history. */
  priorActions: readonly PriorAction[];
}

export interface PriorAction {
  server: string;
  tool: string;
  permission?: string;
  decision: DecisionType;
  risk: RiskLevel;
  at: string;
}

// ─── Policy ──────────────────────────────────────────────────────────────────

export interface PolicyContext {
  execution: ExecutionContext;
  permissions: readonly Permission[];
  metadata?: Record<string, unknown>;
}

export interface PolicyResult {
  policyId: string;
  verdict: PolicyVerdict;
  reason: string;
  /** When true, this result overrides lower-priority allows. */
  definitive?: boolean;
}

/**
 * Pluggable policy. Policies must be pure with respect to side effects —
 * no MCP tool execution, no business logic mutations.
 */
export interface Policy {
  id: string;
  name: string;
  /** Lower numbers run first. Default 100. */
  priority?: number;
  evaluate(context: PolicyContext): Promise<PolicyResult> | PolicyResult;
}

// ─── Approval ────────────────────────────────────────────────────────────────

export interface ApprovalRequest {
  id: string;
  requestId: string;
  sessionId: string;
  userId: string;
  workspaceId?: string;
  server: string;
  tool: string;
  permission?: string;
  resource?: string;
  reason: string;
  risk: RiskLevel;
  argumentsHash: string;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
  choice?: ApprovalChoice;
}

export interface ApprovalResolution {
  approvalId: string;
  choice: ApprovalChoice;
  resolvedBy?: string;
}

// ─── Risk ────────────────────────────────────────────────────────────────────

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  factors: string[];
}

export interface RiskScorer {
  id: string;
  assess(context: ExecutionContext, permission?: string): RiskAssessment;
}

// ─── Decision ────────────────────────────────────────────────────────────────

export interface RuntimeDecision {
  type: DecisionType;
  requestId: string;
  reason: string;
  risk: RiskLevel;
  riskScore: number;
  policyMatched?: string;
  approvalId?: string;
  /** Convenience: true only for allow / allow-with-audit. */
  allowed: boolean;
  evaluatedAt: string;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  timestamp: string;
  requestId: string;
  sessionId: string;
  userId: string;
  workspaceId?: string;
  server: string;
  tool: string;
  permission?: string;
  argumentsHash: string;
  decision: DecisionType;
  risk: RiskLevel;
  policyMatched?: string;
  approvalRequired: boolean;
  approvalId?: string;
  reason: string;
  executionDurationMs?: number;
  result?: "success" | "failure" | "skipped";
  error?: string;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export type RuntimeEventType =
  | "request.received"
  | "policy.evaluated"
  | "approval.requested"
  | "approval.granted"
  | "approval.denied"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "request.denied";

export interface RuntimeEvent<T = unknown> {
  type: RuntimeEventType;
  timestamp: string;
  requestId?: string;
  payload: T;
}

export type RuntimeEventHandler = (event: RuntimeEvent) => void | Promise<void>;

// ─── Tool proxy ──────────────────────────────────────────────────────────────

export interface ToolExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

/**
 * Transport that actually invokes the downstream MCP server.
 * Hosts inject their own implementation (stdio, HTTP, SDK client, etc.).
 */
export interface McpTransport {
  callTool(
    server: string,
    tool: string,
    args?: Record<string, unknown>
  ): Promise<{ data?: unknown; error?: string }>;
}
