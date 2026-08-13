/**
 * Whether BehalfID is actually protecting an agent, answered from server state.
 *
 * The rule this module exists to enforce: never ask the browser whether setup
 * is done. Every field below is derived from a row BehalfID owns — the agent,
 * its permissions, its verification log, its approval requests — so a returning
 * user, a second device, a revoked credential, or a deleted agent all produce
 * the correct answer without any stored "step 3 complete" flag.
 *
 * Three states, and they genuinely differ:
 *
 *   configured — the customer told us what they want. Policy exists.
 *   connected  — something presented this agent's credential to us.
 *   verified   — a real decision came back through the real path.
 */

import { accountScopeFilter } from "@/lib/accountAccess";
import { countApprovals, findApprovals } from "@/lib/repositories/approvals";
import { findOneAgent } from "@/lib/repositories/agents";
import { countPermissions } from "@/lib/repositories/permissions";
import { countLogs, findLogs } from "@/lib/repositories/verificationLogs";
import {
  PROTECTION_SURFACES,
  resolveReadinessState,
  surfaceForAction,
  PROTECTION_SURFACE_HINTS,
  PROTECTION_SURFACE_LABELS,
  type AgentSetupReadiness,
  type ProtectionSurface,
  type WorkspaceProtectionStatus
} from "@/lib/setupReadinessTypes";

export * from "@/lib/setupReadinessTypes";

function relativeTime(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Build readiness for one agent. Every query is account-scoped, so this can
 * never read across a workspace boundary even if handed a foreign agent id.
 */
export async function getAgentSetupReadiness(
  accountId: string,
  agentId: string
): Promise<AgentSetupReadiness | null> {
  const scope = accountScopeFilter(accountId);

  const agent = await findOneAgent({ ...scope, agentId });
  if (!agent) return null;

  const [activePermissions, verifications, approvals, recentLogs, recentApprovals] =
    await Promise.all([
      countPermissions({ ...scope, agentId, status: "active" }),
      countLogs({ ...scope, agentId }),
      countApprovals({ ...scope, agentId }),
      findLogs({ ...scope, agentId }, { sort: { createdAt: -1 }, limit: 20 }),
      findApprovals({ ...scope, agentId }, { sort: { createdAt: -1 }, limit: 1 })
    ]);

  const logs = Array.isArray(recentLogs) ? recentLogs : [];
  const approvalRows = Array.isArray(recentApprovals) ? recentApprovals : [];

  const observedActions: string[] = [];
  for (const log of logs) {
    const action = typeof log.action === "string" ? log.action : null;
    if (action && !observedActions.includes(action)) observedActions.push(action);
  }

  const latest = logs[0] ?? null;
  const agentDisabled = agent.status === "disabled";
  const credentialUsed = Boolean(agent.lastUsedAt);
  const policyConfigured = activePermissions > 0;
  const verificationObserved = verifications > 0;

  const state = resolveReadinessState({
    agentReady: !agentDisabled,
    credentialUsed,
    policyConfigured,
    verificationObserved
  });

  return {
    agentId: agent.agentId,
    agentName: agent.name,
    agentStatus: agent.status ?? "active",
    state,
    agentReady: {
      ok: !agentDisabled,
      evidence: "detected",
      detail: agentDisabled ? "This agent is disabled, so every request is refused." : undefined
    },
    credential: {
      // A key hash always exists for a created agent; what matters is whether
      // anything has presented it.
      ok: credentialUsed,
      evidence: credentialUsed ? "detected" : "unknown",
      detail: credentialUsed
        ? `Key last used ${relativeTime(agent.lastUsedAt)}`
        : "Issued, but nothing has used it yet."
    },
    policy: {
      ok: policyConfigured,
      evidence: "detected",
      detail: policyConfigured
        ? `${activePermissions} active rule${activePermissions === 1 ? "" : "s"}`
        : "No active rules, so every action is refused."
    },
    enforcement: {
      ok: verificationObserved,
      evidence: verificationObserved ? "detected" : "unknown",
      detail: verificationObserved
        ? `${verifications} decision${verifications === 1 ? "" : "s"}, last ${relativeTime(latest?.createdAt)}`
        : "No decision has reached BehalfID yet."
    },
    approvalFlow: {
      ok: approvals > 0,
      evidence: approvals > 0 ? "detected" : "unknown",
      detail:
        approvals > 0
          ? `${approvals} approval request${approvals === 1 ? "" : "s"}, last ${relativeTime(
              approvalRows[0]?.createdAt as Date | undefined
            )}`
          : "No action has needed approval yet."
    },
    observedActions,
    lastDecision: latest
      ? {
          requestId: typeof latest.requestId === "string" ? latest.requestId : "",
          action: typeof latest.action === "string" ? latest.action : "",
          allowed: latest.allowed === true,
          approvalRequired: latest.approvalRequired === true,
          reason: typeof latest.reason === "string" ? latest.reason : "",
          createdAt: toIso(latest.createdAt as Date | undefined)
        }
      : null,
    counts: {
      activePermissions,
      verifications,
      approvals
    }
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Workspace-level protection surfaces
// ────────────────────────────────────────────────────────────────────────────

/**
 * Protecting Claude Code on one laptop must never read as "everything is
 * protected". These are the separate surfaces we can speak to, each answered
 * from observed traffic rather than from what the customer set up once.
 */
/**
 * Which surfaces are genuinely protected, derived from what BehalfID has
 * actually decided. An agent that exists but has never sent a request does not
 * make its surface active — that is the whole point.
 */
export async function getWorkspaceProtectionStatus(
  accountId: string,
  options: { lookbackDays?: number } = {}
): Promise<WorkspaceProtectionStatus[]> {
  const scope = accountScopeFilter(accountId);
  const since = new Date(Date.now() - (options.lookbackDays ?? 30) * 24 * 60 * 60 * 1000);

  const logs = await findLogs(
    { ...scope, createdAt: { $gte: since } },
    { sort: { createdAt: -1 }, limit: 500 }
  );
  const rows = Array.isArray(logs) ? logs : [];

  const bySurface = new Map<ProtectionSurface, Set<string>>();
  for (const surface of PROTECTION_SURFACES) bySurface.set(surface, new Set());

  for (const log of rows) {
    const action = typeof log.action === "string" ? log.action : null;
    const agentId = typeof log.agentId === "string" ? log.agentId : null;
    if (!action || !agentId) continue;
    bySurface.get(surfaceForAction(action))?.add(agentId);
  }

  // VerificationLog stores agentId only; resolve display names from the agents
  // the caller already owns rather than trusting anything on the log row.
  const agentIds = [...new Set([...bySurface.values()].flatMap((set) => [...set]))];
  const names = new Map<string, string>();
  for (const agentId of agentIds) {
    const agent = await findOneAgent({ ...scope, agentId }, { select: "agentId name" });
    if (agent) names.set(agentId, agent.name ?? agentId);
  }

  return PROTECTION_SURFACES.map((surface) => {
    const agents = [...(bySurface.get(surface) ?? new Set())].map((agentId) => ({
      agentId,
      agentName: names.get(agentId) ?? agentId
    }));
    return {
      surface,
      label: PROTECTION_SURFACE_LABELS[surface],
      hint: PROTECTION_SURFACE_HINTS[surface],
      active: agents.length > 0,
      detail: agents.length
        ? `${agents.length} agent${agents.length === 1 ? "" : "s"} sending decisions`
        : "Nothing connected here yet.",
      agents
    };
  });
}
