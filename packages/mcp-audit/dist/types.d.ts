/**
 * Shared contracts for the BehalfID MCP Auditing Engine.
 *
 * These types are the public API surface for audit reports, findings,
 * remediation actions, and rule plugins.
 */
/** Finding severity used for scoring and prioritization. */
export type McpAuditSeverity = "critical" | "high" | "medium" | "low";
/** Finding category — one per security concern class. */
export type McpAuditCategory = "untrusted-server" | "dangerous-tool" | "filesystem-access" | "network-access" | "credential-exposure" | "missing-approval" | "fail-open" | "unenforced-policy" | "configuration";
/** Remediation action types that BehalfID can apply automatically. */
export type BehalfIdActionType = "create-permission" | "require-approval" | "block-action" | "enable-profile";
/**
 * Draft remediation action for BehalfID policy generation.
 * `draftPayload` must contain enough information to create the policy
 * without re-reading the original MCP configuration.
 */
export interface BehalfIdAction {
    type: BehalfIdActionType;
    draftPayload: Record<string, unknown>;
}
/** A single security finding produced by an audit rule. */
export interface McpAuditFinding {
    /** Stable finding identifier (unique within a report). */
    id: string;
    /** Rule that produced this finding. */
    ruleId: string;
    category: McpAuditCategory;
    severity: McpAuditSeverity;
    title: string;
    description: string;
    /**
     * Human-readable evidence explaining why the finding was produced.
     * Must never contain secret values — only paths, names, and redacted hints.
     */
    evidence: string[];
    /** MCP server name when the finding is server-scoped. */
    serverName?: string;
    /** Tool name when the finding is tool-scoped. */
    toolName?: string;
    /** Optional free-text remediation guidance. */
    remediation?: string;
    /** Optional structured BehalfID remediation action. */
    action?: BehalfIdAction;
}
/** Aggregate counts and score for a completed audit. */
export interface McpAuditSummary {
    /** Overall security score from 0–100 (100 = no findings). */
    securityScore: number;
    totalFindings: number;
    bySeverity: Record<McpAuditSeverity, number>;
    byCategory: Partial<Record<McpAuditCategory, number>>;
    serverCount: number;
}
/** Per-server summary included in the report. */
export interface McpAuditedServer {
    name: string;
    trusted: boolean;
    toolCount: number;
    findingCount: number;
    /** Highest severity among findings for this server, or "none". */
    riskLevel: McpAuditSeverity | "none";
}
/** Complete audit report returned by {@link AuditEngine}. */
export interface McpAuditReport {
    generatedAt: string;
    summary: McpAuditSummary;
    findings: McpAuditFinding[];
    servers: McpAuditedServer[];
}
/** Declared MCP tool shape used during auditing (read-only). */
export interface McpToolDefinition {
    name: string;
    description?: string;
    /**
     * Whether this tool currently requires user approval before execution.
     * Undefined means approval status is unknown / not configured.
     */
    requiresApproval?: boolean;
    /** Declared permission strings (e.g. "filesystem:read", "network:*"). */
    permissions?: string[];
    /** Additional unstructured metadata from the MCP host. */
    metadata?: Record<string, unknown>;
}
/** Filesystem / network / process capability declarations. */
export interface McpServerCapabilities {
    /** Unrestricted filesystem access (any path). */
    filesystemUnrestricted?: boolean;
    /** Access to the user home directory. */
    homeDirectoryAccess?: boolean;
    /** Recursive directory traversal / glob access. */
    recursiveDirectoryAccess?: boolean;
    /** Unrestricted outbound network requests. */
    networkUnrestricted?: boolean;
    /** Ability to fetch arbitrary remote URLs. */
    remoteFetch?: boolean;
    /** Embedded HTTP client capability. */
    httpClient?: boolean;
    /** Allowed URL patterns; empty / "*" means arbitrary URLs. */
    allowedUrls?: string[];
    /** Shell / terminal / process spawn capability. */
    shellAccess?: boolean;
    /** Arbitrary code execution capability. */
    codeExecution?: boolean;
}
/** A named policy attached to (or intended for) MCP servers. */
export interface McpPolicyDefinition {
    id: string;
    name: string;
    /** Server names this policy should apply to. Empty = all servers. */
    appliesToServers?: string[];
    /** Whether the policy is currently enforced by the host. */
    enforced?: boolean;
    /** Policy action strings (for matching / reporting). */
    actions?: string[];
}
/**
 * One MCP server entry as understood by the auditor.
 *
 * This is a normalized view of host config (e.g. `.mcp.json`, Cursor MCP
 * settings) plus optional tool / capability / policy metadata.
 */
export interface McpServerConfig {
    name: string;
    /** Config path hint for evidence (e.g. ".mcp.json#mcpServers.foo"). */
    configPath?: string;
    type?: string;
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    /** Explicit trust / approval flags from the host. */
    trusted?: boolean;
    approved?: boolean;
    tools?: McpToolDefinition[];
    capabilities?: McpServerCapabilities;
    /**
     * When true, the server (or host binding) allows actions if policy
     * evaluation fails — a fail-open posture.
     */
    failOpen?: boolean;
    /**
     * Policy IDs that are configured to apply to this server.
     * Used with top-level policies to detect unenforced policies.
     */
    appliedPolicyIds?: string[];
    /** Raw residual fields preserved for configuration analysis. */
    raw?: Record<string, unknown>;
}
/**
 * Input configuration for an audit run.
 * The auditor never writes to disk or executes MCP tools.
 */
export interface McpAuditConfiguration {
    /** Normalized MCP servers to audit. */
    servers: McpServerConfig[];
    /**
     * Allow-list of trusted / approved server names.
     * Servers not in this list (and not marked trusted/approved) are flagged.
     */
    trustedServers?: string[];
    /** Policies known to the host / BehalfID profile. */
    policies?: McpPolicyDefinition[];
    /**
     * Host-level fail-open default (e.g. allow when verify is unavailable).
     */
    failOpenDefault?: boolean;
    /** Optional source path for evidence (e.g. ".mcp.json"). */
    sourcePath?: string;
}
/**
 * Context passed to every {@link AuditRule}.
 * Rules must treat this as read-only and must not mutate it.
 */
export interface AuditContext {
    configuration: McpAuditConfiguration;
    /** ISO timestamp when the audit run started. */
    startedAt: string;
}
/**
 * Pluggable audit rule.
 * Implement this interface and register with {@link RuleRegistry}.
 */
export interface AuditRule {
    id: string;
    name: string;
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
}
/** Severity → score deduction used by {@link ScoreCalculator}. */
export declare const SEVERITY_SCORE_WEIGHTS: Readonly<Record<McpAuditSeverity, number>>;
/** Severity ranking for risk-level rollups (higher = worse). */
export declare const SEVERITY_RANK: Readonly<Record<McpAuditSeverity, number>>;
