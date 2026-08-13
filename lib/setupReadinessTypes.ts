/**
 * Client-safe half of the readiness model: the vocabulary, the shapes, and the
 * pure functions that classify them.
 *
 * `lib/setupReadiness.ts` holds the queries. Keeping them apart means a React
 * client component can render a readiness object without pulling the
 * repository layer — and therefore `next/headers` — into the browser bundle.
 */

export const READINESS_STATES = ["not_started", "configured", "connected", "verified"] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

export const READINESS_STATE_LABELS: Record<ReadinessState, string> = {
  not_started: "Not started",
  configured: "Configured",
  connected: "Connected",
  verified: "Protecting"
};

export type ReadinessSignal = {
  /** True when BehalfID has server-side proof. */
  ok: boolean;
  /**
   * `detected` — proven by a row BehalfID owns.
   * `asserted` — the customer said so and we cannot check it.
   * `unknown`  — not applicable, or nothing observed yet.
   */
  evidence: "detected" | "asserted" | "unknown";
  /** Human-readable proof, e.g. "last used 2 minutes ago". */
  detail?: string;
};

export type AgentSetupReadiness = {
  agentId: string;
  agentName: string;
  agentStatus: string;
  state: ReadinessState;
  /** The agent row exists and is not disabled. */
  agentReady: ReadinessSignal;
  /** A credential has been issued (and, once used, when). */
  credential: ReadinessSignal;
  /** At least one active permission — i.e. a policy to enforce. */
  policy: ReadinessSignal;
  /** A verification arrived, so something is really wired up. */
  enforcement: ReadinessSignal;
  /** An approval request was created through the real path. */
  approvalFlow: ReadinessSignal;
  /** Distinct actions BehalfID has actually seen, newest first. */
  observedActions: string[];
  /** Most recent verification, when there is one. */
  lastDecision: {
    requestId: string;
    action: string;
    allowed: boolean;
    approvalRequired: boolean;
    reason: string;
    createdAt: string | null;
  } | null;
  counts: {
    activePermissions: number;
    verifications: number;
    approvals: number;
  };
};

/**
 * Collapse the signals into one state.
 *
 * Deliberately conservative: a policy with no observed traffic is "configured",
 * never "protecting". Seeing the credential used is enough for "connected";
 * only a real decision earns "verified".
 */
export function resolveReadinessState(input: {
  agentReady: boolean;
  credentialUsed: boolean;
  policyConfigured: boolean;
  verificationObserved: boolean;
}): ReadinessState {
  if (!input.agentReady) return "not_started";
  if (input.verificationObserved && input.policyConfigured) return "verified";
  if (input.credentialUsed) return "connected";
  if (input.policyConfigured) return "configured";
  return "configured";
}

export const PROTECTION_SURFACES = ["coding_agent", "ci", "service"] as const;
export type ProtectionSurface = (typeof PROTECTION_SURFACES)[number];

export const PROTECTION_SURFACE_LABELS: Record<ProtectionSurface, string> = {
  coding_agent: "Coding agents on developer machines",
  ci: "CI pipelines",
  service: "Your own agents and services"
};

export const PROTECTION_SURFACE_HINTS: Record<ProtectionSurface, string> = {
  coding_agent: "Claude Code, Codex, or Cursor running on a laptop.",
  ci: "GitHub Actions or another pipeline that ships without a person watching.",
  service: "An agent or backend you wrote that calls BehalfID itself."
};

/** Actions only the CLI hook produces. Seeing one proves a coding agent is wired up. */
const CLI_HOOK_ACTIONS = new Set([
  "read_file",
  "write_file",
  "execute_command",
  "browse_web",
  "mcp_tool",
  "spawn_agent"
]);

/** Actions that indicate a pipeline-shaped integration. */
const SHIPPING_ACTIONS = new Set([
  "deploy_production",
  "deploy",
  "database_migrate_production",
  "secrets_write"
]);

export function surfaceForAction(action: string): ProtectionSurface {
  if (CLI_HOOK_ACTIONS.has(action)) return "coding_agent";
  if (SHIPPING_ACTIONS.has(action)) return "ci";
  return "service";
}

export type WorkspaceProtectionStatus = {
  surface: ProtectionSurface;
  label: string;
  hint: string;
  /** True only when a real decision for this surface has been observed. */
  active: boolean;
  detail: string;
  /** Agents that produced traffic on this surface. */
  agents: Array<{ agentId: string; agentName: string }>;
};

