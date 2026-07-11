export type BehalfIDConfig = {
  apiKey: string;
  developerToken?: string;
  baseUrl?: string;
  allowInsecureHttp?: boolean;
};

export type VerifyInput = {
  agentId: string;
  action: string;
  amount?: number;
  vendor?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  /**
   * Non-persisted constraint arguments (e.g. sanitized Claude Code hook input).
   * Used only during policy evaluation — never stored in VerificationLog and
   * never included in webhook payloads. Must be under 16 KB when serialized.
   */
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
};

export type RiskLevel = "low" | "medium" | "high";

export type VerifyResult = {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: RiskLevel;
};

export type ExecuteActionInput = {
  agentId: string;
  action: "browse_web" | string;
  resource: "web" | string;
  input: {
    url: string;
  };
};

export type ExecuteActionResult = {
  requestId?: string;
  allowed: boolean;
  decision: "allowed" | "denied";
  reason: string;
  executed: boolean;
  error?: string;
  result?: {
    url: string;
    status: number;
    contentType: string;
    title: string | null;
    excerpt: string;
    truncated: boolean;
  };
};

export type CreateAgentResult = {
  agentId: string;
  apiKey: string;
  agentType?: AgentType;
  provider?: AgentProvider;
};

export type AgentType = "native" | "connected";

export type AgentProvider =
  | "custom"
  | "ollie"
  | "chatgpt"
  | "claude"
  | "gemini"
  | "zapier"
  | "make"
  | "langchain"
  | "openai"
  | "other";

export type CreateAgentInput = {
  name: string;
  agentType?: AgentType;
  provider?: AgentProvider;
  externalAgentId?: string;
  externalAgentLabel?: string;
  description?: string;
  connectionStatus?: "manual" | "connected" | "disconnected";
};

export type PermissionConstraints = {
  maxAmount?: number;
  allowedVendors?: string[];
  expiresAt?: string;
};

export type PermissionTemplate =
  | "access_data"
  | "create_content"
  | "schedule"
  | "purchase"
  | "custom";

export type CreatePermissionInput = {
  agentId: string;
  action: string;
  description?: string;
  resource?: string;
  scope?: string;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean;
  notes?: string;
  template?: PermissionTemplate;
  constraints?: PermissionConstraints;
};

export type CreatePermissionResult = {
  permissionId: string;
  status: "active" | "revoked" | string;
};

export type RotateKeyResult = {
  agentId: string;
  apiKey: string;
};

export type VerificationLog = {
  requestId: string;
  agentId: string;
  permissionId: string | null;
  action: string;
  amount?: number;
  vendor?: string;
  allowed: boolean;
  reason: string;
  risk: RiskLevel;
  createdAt: string;
};

export type { VerifyWebhookSignatureInput } from "./webhooks.js";

// ─── Site Guard ───────────────────────────────────────────────────────────────

/**
 * Input for {@link SiteGuardNamespace.check}.
 *
 * When using a site key (`bhf_site_...`) you do **not** need to include
 * `siteId` or `domain` — the key already encodes the site scope.
 */
export type SiteGuardCheckInput = {
  /** Absolute request path, e.g. `/docs/getting-started`. No query string. */
  path: string;
  /** Raw `User-Agent` header from the incoming request, if available. */
  userAgent?: string;
  /** Caller-supplied agent identifier (e.g. `"crawler_alpha"`). Weak signal. */
  agentIdentifier?: string;
  /** Optional metadata object (must be under 2 KB). Secret-looking keys are
   *  redacted before storage. Metadata is not persisted in Site Guard logs. */
  metadata?: Record<string, unknown>;
};

/**
 * Typed response from `POST /api/site-guard/check`.
 *
 * Always check `allowed` before serving the route. Fail closed when
 * `allowed` is `false` or when the call throws.
 */
export type SiteGuardCheckResult = {
  /** `true` means serve the route; `false` means block it. */
  allowed: boolean;
  /** Human-readable explanation of the decision. */
  reason: string;
  /** Unique request ID for this check. */
  requestId: string;
  /** The Site Guard rule that matched, or `null` when no rule matched. */
  matchedRuleId: string | null;
  /** The site scope resolved by the API. */
  siteId: string | null;
};
