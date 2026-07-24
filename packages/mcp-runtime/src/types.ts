/**
 * Canonical contracts for `@behalfid/mcp-runtime` as a Policy Enforcement Point.
 *
 * Authorization decisions live in the BehalfID platform (`verify()`).
 * This package only intercepts, maps, enforces, and proxies.
 */

// ─── Invocation ──────────────────────────────────────────────────────────────

/**
 * Provider-agnostic MCP tool invocation.
 * Every host (Cursor, Claude Desktop, VS Code, Windsurf, …) normalizes into this
 * before authorization.
 */
export interface McpInvocation {
  requestId: string;
  sessionId: string;
  userId: string;
  /**
   * BehalfID agent id used for verify().
   * Optional when the runtime was constructed with a default `agentId`.
   */
  agentId?: string;
  /** Host / client identifier, e.g. "cursor", "claude-desktop", "vscode". */
  provider: string;
  workspaceId?: string;
  server: string;
  tool: string;
  arguments?: unknown;
  metadata?: {
    cwd?: string;
    home?: string;
    clientVersion?: string;
    model?: string;
    [key: string]: unknown;
  };
}

// ─── Platform verify (source of truth) ───────────────────────────────────────

/** Subset of SDK VerifyInput used by the mapper — no local policy fields. */
export interface VerifyRequest {
  agentId: string;
  action: string;
  amount?: number;
  vendor?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  policyContext?: {
    source?: string;
    toolName?: string;
    cwd?: string;
    home?: string;
    toolInput?: {
      filePath?: string;
      command?: string;
    };
  };
}

export type VerifyRisk = "low" | "medium" | "high";

/**
 * Decision returned by BehalfID verify / POST /api/verify.
 * Mirrors `@behalfid/sdk` VerifyResult approval fields.
 */
export interface VerifyDecision {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: VerifyRisk;
  approvalRequired?: boolean;
  approvalId?: string;
}

/**
 * Injectable verify client — wrap `@behalfid/sdk` BehalfID.verify or HTTP.
 * The runtime never evaluates policy itself.
 */
export interface VerifyClient {
  verify(input: VerifyRequest): Promise<VerifyDecision>;
}

/**
 * Host-provided approval pause. Reuses the platform ApprovalRequest flow.
 *
 * Return `"denied"` to block, `"granted"` to re-verify (consumes grant),
 * or `{ granted: true, decision }` when the waiter already obtained an
 * allowed verify result (avoids double-consuming a one-shot grant).
 */
export type ApprovalWaitResult =
  | "granted"
  | "denied"
  | { granted: true; decision: VerifyDecision };

export type ApprovalWaiter = (ctx: {
  approvalId: string;
  invocation: McpInvocation;
  decision: VerifyDecision;
}) => Promise<ApprovalWaitResult>;

// ─── Transport & execution ───────────────────────────────────────────────────

export interface McpTransport {
  callTool(
    server: string,
    tool: string,
    args?: unknown
  ): Promise<{ data?: unknown; error?: string }>;
}

export interface ToolExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

export type RuntimeOutcome =
  | "allowed"
  | "denied"
  | "approval-denied"
  | "verify-unavailable"
  | "verify-malformed"
  | "verify-timeout";

export interface RuntimeExecuteResult {
  outcome: RuntimeOutcome;
  invocation: McpInvocation;
  decision?: VerifyDecision;
  execution?: ToolExecutionResult;
  /** Present when execution was blocked. */
  error?: string;
}

export interface ExecutionReceipt {
  requestId: string;
  success: boolean;
  durationMs: number;
  error?: string;
  server: string;
  tool: string;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export type RuntimeEventType =
  | "invocation.received"
  | "verification.started"
  | "verification.completed"
  | "verification.denied"
  | "approval.required"
  | "approval.granted"
  | "approval.denied"
  | "execution.started"
  | "execution.completed"
  | "execution.failed";

export interface RuntimeEvent<T = unknown> {
  type: RuntimeEventType;
  timestamp: string;
  requestId?: string;
  payload: T;
}

export type RuntimeEventHandler = (event: RuntimeEvent) => void | Promise<void>;
