export type SmartSuggestionKind = "log_query" | "docs" | "page" | "field" | "knowledge";

export type SmartSuggestion = {
  id: string;
  kind: SmartSuggestionKind;
  title: string;
  description: string;
  /** Text inserted / applied when the suggestion is chosen. */
  query: string;
  /** Optional navigation target (docs / dashboard pages). */
  href?: string;
  /** Structured log filters applied when chosen in the logs console. */
  logFilters?: {
    search?: string;
    decision?: string;
    risk?: string;
    agentId?: string;
    action?: string;
    environment?: string;
    range?: "" | "24h" | "7d";
  };
  keywords?: string[];
};

/** Shared docs index — kept in sync with public docs nav. */
export const DOCS_SEARCH_INDEX: ReadonlyArray<{
  href: string;
  title: string;
  body: string;
}> = [
  {
    href: "/docs",
    title: "Overview",
    body: "BehalfID connects external agents and native custom agents to scoped permissions, verification decisions, audit logs, and signed webhook events."
  },
  {
    href: "/docs/quickstart",
    title: "Quickstart",
    body: "Create an agent, add a permission, install the SDK, call verify before execution, show allowed and denied requests, and fail closed."
  },
  {
    href: "/docs/cli",
    title: "CLI",
    body: "Install the behalf CLI to manage agents, permissions, and enforcement from the terminal. Includes MCP server setup, AI tool launchers, context generation, and key management."
  },
  {
    href: "/docs/deploy-approvals",
    title: "Deploy approvals",
    body: "Step-by-step demo: Claude Code or Codex attempts a production deploy, BehalfID blocks it, you approve in the dashboard, the agent retries and succeeds."
  },
  {
    href: "/docs/api",
    title: "API Reference",
    body: "Use public REST endpoints for connected agents, permissions, verification, logs, and key rotation. Requires an API key. POST verify, GET agents, PATCH permissions."
  },
  {
    href: "/docs/sdk",
    title: "SDK",
    body: "Install the JavaScript SDK from npm and call BehalfID from Node 18+. Import BehalfID, call verify, and fail closed before running your executor."
  },
  {
    href: "/docs/action-gateway",
    title: "Action Gateway",
    body: "Route safe public web reads through BehalfID so denied actions fail before execution. Proxy HTTP requests with permission enforcement built in."
  },
  {
    href: "/docs/webhooks",
    title: "Webhooks",
    body: "Receive signed verification events through an outbox-backed delivery system. HMAC signatures, retries, payload structure, and endpoint configuration."
  },
  {
    href: "/docs/site-guard",
    title: "Site Guard",
    body: "Design website middleware, workers, or gateways that enforce AI access rules before protected workflows run. Block or challenge agent requests at the edge."
  },
  {
    href: "/docs/concepts",
    title: "Concepts",
    body: "Understand native agents, connected agents, permission passports, providers, and audit logs. Fail-closed enforcement, agent types, scope templates, and constraints."
  },
  {
    href: "/docs/troubleshooting",
    title: "Troubleshooting",
    body: "Diagnose verify failures, CLI doctor, auth errors, webhook delivery failures, and installer error codes with actionable fixes."
  },
  {
    href: "/security",
    title: "Security",
    body: "How BehalfID handles secrets, tokens, fail-closed enforcement, audit logs, and current limitations. Key hashing, one-time display, and SSRF protections."
  }
];

const LOG_QUERY_TEMPLATES: SmartSuggestion[] = [
  {
    id: "log-denied",
    kind: "log_query",
    title: "Find denied decisions",
    description: "Show verification events that were blocked",
    query: "find denied decisions",
    logFilters: { decision: "denied", search: "" },
    keywords: ["blocked", "rejected", "deny"]
  },
  {
    id: "log-allowed",
    kind: "log_query",
    title: "Find allowed decisions",
    description: "Show verification events that passed policy",
    query: "find allowed decisions",
    logFilters: { decision: "allowed", search: "" },
    keywords: ["permitted", "pass"]
  },
  {
    id: "log-approval",
    kind: "log_query",
    title: "Find approvals required",
    description: "Events waiting on human approval",
    query: "find approvals required",
    logFilters: { decision: "approval_required", search: "" },
    keywords: ["needs approval", "pending"]
  },
  {
    id: "log-high-risk",
    kind: "log_query",
    title: "Find high-risk events",
    description: "Filter decision history to high risk",
    query: "find high risk events",
    logFilters: { risk: "high", search: "" },
    keywords: ["critical", "severe"]
  },
  {
    id: "log-denied-high",
    kind: "log_query",
    title: "Find a denied action that's high risk",
    description: "Denied + high risk combined filter",
    query: "find a denied action that's high risk",
    logFilters: { decision: "denied", risk: "high", search: "" },
    keywords: ["find a", "that's"]
  },
  {
    id: "log-prod",
    kind: "log_query",
    title: "Find events in production",
    description: "Match metadata environment = production",
    query: "find events in production",
    logFilters: { environment: "production", search: "" },
    keywords: ["prod", "environment"]
  },
  {
    id: "log-24h",
    kind: "log_query",
    title: "Find events from the last 24 hours",
    description: "Rolling 24-hour retention window",
    query: "find events from the last 24 hours",
    logFilters: { range: "24h", search: "" },
    keywords: ["today", "recent"]
  },
  {
    id: "log-7d",
    kind: "log_query",
    title: "Find events from the last 7 days",
    description: "Rolling 7-day retention window",
    query: "find events from the last 7 days",
    logFilters: { range: "7d", search: "" },
    keywords: ["week", "recent"]
  },
  {
    id: "log-field-decision",
    kind: "field",
    title: "decision:",
    description: "Filter by allowed, denied, or approval_required",
    query: "decision:",
    keywords: ["field", "filter"]
  },
  {
    id: "log-field-risk",
    kind: "field",
    title: "risk:",
    description: "Filter by low, medium, or high",
    query: "risk:",
    keywords: ["field", "filter"]
  },
  {
    id: "log-field-agent",
    kind: "field",
    title: "agent:",
    description: "Filter by agent ID",
    query: "agent:",
    keywords: ["field", "filter"]
  },
  {
    id: "log-field-action",
    kind: "field",
    title: "action:",
    description: "Filter by action name",
    query: "action:",
    keywords: ["field", "filter"]
  },
  {
    id: "log-field-env",
    kind: "field",
    title: "env:",
    description: "Filter by environment metadata",
    query: "env:",
    keywords: ["field", "filter", "environment"]
  }
];

const APP_KNOWLEDGE: SmartSuggestion[] = [
  {
    id: "page-logs",
    kind: "page",
    title: "Audit logs",
    description: "Workspace verification decision history",
    query: "audit logs",
    href: "/dashboard/logs",
    keywords: ["verification", "history", "events"]
  },
  {
    id: "page-approvals",
    kind: "page",
    title: "Approvals",
    description: "Review and resolve pending agent approvals",
    query: "approvals",
    href: "/dashboard/approvals",
    keywords: ["inbox", "human in the loop"]
  },
  {
    id: "page-agents",
    kind: "page",
    title: "Agents",
    description: "Manage connected and native agents",
    query: "agents",
    href: "/dashboard/agents",
    keywords: ["identity", "passport"]
  },
  {
    id: "page-inbox",
    kind: "page",
    title: "Needs attention",
    description: "Items that need an operator response",
    query: "needs attention",
    href: "/dashboard/inbox",
    keywords: ["inbox", "attention"]
  },
  {
    id: "page-webhooks",
    kind: "page",
    title: "Webhooks",
    description: "Signed delivery of verification events",
    query: "webhooks",
    href: "/dashboard/webhooks",
    keywords: ["outbox", "events"]
  },
  {
    id: "knowledge-verify",
    kind: "knowledge",
    title: "How verify() works",
    description: "Agents must call verify before execution; denied actions fail closed",
    query: "how does verify work",
    href: "/docs/concepts",
    keywords: ["enforcement", "fail closed", "sdk"]
  },
  {
    id: "knowledge-receipt",
    kind: "knowledge",
    title: "What is a verification receipt?",
    description: "Each decision records agent, action, reason, risk, and request ID",
    query: "verification receipt",
    href: "/dashboard/logs",
    keywords: ["audit", "log", "request id"]
  },
  {
    id: "knowledge-doctor",
    kind: "knowledge",
    title: "Run behalf doctor",
    description: "Diagnose CLI config, MCP registration, hooks, and API health",
    query: "behalf doctor",
    href: "/docs/troubleshooting",
    keywords: ["doctor", "mcp", "hook", "debug", "fix"]
  },
  {
    id: "knowledge-verify-denied",
    kind: "knowledge",
    title: "Why was verify denied?",
    description: "Match the reason string from verify or logs to a concrete fix",
    query: "verify denied reason",
    href: "/docs/troubleshooting#verify-failures",
    keywords: ["denied", "reason", "permission", "approval"]
  },
  {
    id: "knowledge-webhook-fail",
    kind: "knowledge",
    title: "Webhook delivery failed",
    description: "Signature skew, redirects, retries, and dead-letter replay",
    query: "webhook delivery failed",
    href: "/docs/troubleshooting#webhooks",
    keywords: ["webhook", "signature", "dead letter", "retry"]
  }
];

function docsToSuggestions(): SmartSuggestion[] {
  return DOCS_SEARCH_INDEX.map((doc) => ({
    id: `docs-${doc.href}`,
    kind: "docs" as const,
    title: doc.title,
    description: doc.body,
    query: doc.title,
    href: doc.href,
    keywords: doc.body.toLowerCase().split(/\W+/).filter((token) => token.length > 3).slice(0, 12)
  }));
}

/** Full shared catalog for omnibar / autocomplete. */
export const SMART_SEARCH_CATALOG: readonly SmartSuggestion[] = [
  ...LOG_QUERY_TEMPLATES,
  ...docsToSuggestions(),
  ...APP_KNOWLEDGE
];

export function catalogForScope(scope: "all" | "logs" | "docs"): readonly SmartSuggestion[] {
  if (scope === "logs") {
    return SMART_SEARCH_CATALOG.filter((item) => item.kind === "log_query" || item.kind === "field" || item.kind === "knowledge");
  }
  if (scope === "docs") {
    return SMART_SEARCH_CATALOG.filter((item) => item.kind === "docs" || item.kind === "knowledge");
  }
  return SMART_SEARCH_CATALOG;
}
