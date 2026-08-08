import { accountScopeFilter } from "@/lib/accountAccess";
import { AUTHORITY_LEVELS, resolveWorkspaceRole, type WorkspaceRole } from "@/lib/authority";
import { countAgents } from "@/lib/repositories/agents";
import { countApprovals, findApprovals } from "@/lib/repositories/approvals";
import {
  aggregateDailyDecisions,
  countLogs,
  findAgentNames,
  findLogs
} from "@/lib/repositories/verificationLogs";
import { retentionSince } from "@/lib/quota";
import type { PlanBearingAccount } from "@/lib/planGrants";

/**
 * Server-side loader for the dashboard Overview.
 *
 * ## Metric semantics
 *
 * Every number below is defined once, here, and the definition is what the page
 * renders — the display never reclassifies anything.
 *
 * - **Pending approvals** — approval requests in `pending` for this workspace.
 * - **Actions verified today** — enforced decisions recorded since 00:00 UTC.
 *   UTC, not local time, because the verification period and quota reset are
 *   already UTC-based; mixing zones would make the card disagree with billing.
 * - **Active agents** — agents in this workspace with status `active`. Revoked
 *   and disabled agents are excluded because they cannot act.
 * - **Denied or blocked** — decisions in the window that were refused
 *   (`allowed = false`), excluding those that merely required approval.
 *
 * Decisions are classified into three **mutually exclusive** buckets so the
 * chart and the outcome split reconcile to one population:
 *   approval required → the gate fired
 *   allowed           → executed without a gate
 *   denied            → refused
 *
 * Shadow decisions are excluded throughout: they record what *would* have
 * happened and were never enforced.
 *
 * The window is bounded by the workspace's own log retention, so the page never
 * implies history the plan does not keep.
 */

export const OVERVIEW_WINDOW_DAYS = 14;

export type OverviewMetric = {
  /** null means "not established", which the card states rather than showing 0. */
  value: number | null;
};

export type OverviewDay = {
  day: string;
  allowed: number;
  denied: number;
  approvalRequired: number;
};

export type OverviewOutcome = {
  allowed: number;
  denied: number;
  approvalRequired: number;
  total: number;
};

export type OverviewApproval = {
  approvalId: string;
  action: string;
  agentName: string | null;
  vendor: string | null;
  environment: string | null;
  risk: string | null;
  expiresAt: string | null;
};

export type OverviewDecision = {
  logId: string;
  action: string;
  agentName: string | null;
  outcome: "allowed" | "denied" | "approval_required";
  createdAt: string;
  vendor: string | null;
};

export type DashboardOverview = {
  pendingApprovals: OverviewMetric;
  verifiedToday: OverviewMetric;
  activeAgents: OverviewMetric;
  deniedOrBlocked: OverviewMetric;
  windowDays: number;
  daily: OverviewDay[];
  outcome: OverviewOutcome;
  approvals: OverviewApproval[];
  decisions: OverviewDecision[];
  canReview: boolean;
  canMutate: boolean;
  /** True when the workspace has never recorded a decision or agent. */
  isEmpty: boolean;
};

function startOfUtcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function classify(log: {
  allowed?: boolean | null;
  approvalRequired?: boolean | null;
}): OverviewDecision["outcome"] {
  if (log.approvalRequired) return "approval_required";
  return log.allowed ? "allowed" : "denied";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Loads the Overview in a fixed number of queries, none of which read log
 * bodies: four indexed counts, one grouped aggregate, and two small capped
 * lists. Nothing here scales with workspace size.
 */
export async function loadDashboardOverview(input: {
  accountId: string;
  account: PlanBearingAccount | null;
  role: WorkspaceRole | null;
  now?: Date;
}): Promise<DashboardOverview> {
  const now = input.now ?? new Date();
  const scope = accountScopeFilter(input.accountId);
  const todayStart = startOfUtcDay(now);

  // Never look further back than the plan actually retains.
  const retentionStart = retentionSince(input.account);
  const windowStart = new Date(
    Math.max(retentionStart.getTime(), now.getTime() - OVERVIEW_WINDOW_DAYS * 86_400_000)
  );

  const enforced = { ...scope, $or: [{ shadow: false }, { shadow: null }] };

  const [
    pendingApprovals,
    verifiedToday,
    activeAgents,
    deniedOrBlocked,
    daily,
    approvalRows,
    decisionRows
  ] = await Promise.all([
    countApprovals({ ...scope, status: "pending" }),
    countLogs({ ...enforced, createdAt: { $gte: todayStart } }),
    countAgents({ ...scope, status: "active" }),
    countLogs({
      ...enforced,
      allowed: false,
      approvalRequired: false,
      createdAt: { $gte: windowStart }
    }),
    aggregateDailyDecisions({ accountId: input.accountId, since: windowStart }),
    findApprovals(
      { ...scope, status: "pending" },
      { sort: { createdAt: -1 }, limit: 4 }
    ),
    findLogs(
      { ...enforced, createdAt: { $gte: windowStart } },
      {
        sort: { createdAt: -1 },
        limit: 6,
        // Deliberately narrow: no reason text, no metadata, no arguments — the
        // Overview must not become a channel for sensitive payloads.
        select: "-_id logId action agentId vendor allowed approvalRequired createdAt"
      }
    )
  ]);

  const outcome = daily.reduce<OverviewOutcome>(
    (acc, day) => ({
      allowed: acc.allowed + day.allowed,
      denied: acc.denied + day.denied,
      approvalRequired: acc.approvalRequired + day.approvalRequired,
      total: acc.total + day.allowed + day.denied + day.approvalRequired
    }),
    { allowed: 0, denied: 0, approvalRequired: 0, total: 0 }
  );

  // One extra scoped lookup resolves display names for the handful of agents on
  // screen; without it the lists show raw agent ids, which are unreadable.
  const agentIds = [
    ...new Set(
      [...(approvalRows as Array<Record<string, unknown>>), ...(decisionRows as Array<Record<string, unknown>>)]
        .map((row) => readString(row.agentId))
        .filter((id): id is string => id !== null)
    )
  ];
  const nameRows = agentIds.length
    ? ((await findAgentNames(agentIds, { accountId: input.accountId })) as Array<
        Record<string, unknown>
      >)
    : [];
  const agentNames = new Map(
    nameRows.map((row) => [String(row.agentId), readString(row.name)])
  );
  const nameFor = (id: string | null) => (id ? agentNames.get(id) ?? id : null);

  const level = input.role ? AUTHORITY_LEVELS[input.role] : 0;
  const canMutate = level > AUTHORITY_LEVELS.VIEWER;

  return {
    pendingApprovals: { value: pendingApprovals ?? 0 },
    verifiedToday: { value: verifiedToday ?? 0 },
    activeAgents: { value: activeAgents ?? 0 },
    deniedOrBlocked: { value: deniedOrBlocked ?? 0 },
    windowDays: OVERVIEW_WINDOW_DAYS,
    daily,
    outcome,
    approvals: (approvalRows as Array<Record<string, unknown>>).map((row) => ({
      approvalId: String(row.approvalId ?? ""),
      action: String(row.action ?? "action"),
      agentName: readString(row.agentName) ?? nameFor(readString(row.agentId)),
      vendor: readString(row.vendor),
      environment: readString(row.environment),
      risk: readString(row.risk),
      expiresAt:
        row.grantExpiresAt instanceof Date ? row.grantExpiresAt.toISOString() : null
    })),
    decisions: (decisionRows as Array<Record<string, unknown>>).map((row) => ({
      logId: String(row.logId ?? ""),
      action: String(row.action ?? "action"),
      agentName: nameFor(readString(row.agentId)),
      outcome: classify(row as { allowed?: boolean; approvalRequired?: boolean }),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date().toISOString(),
      vendor: readString(row.vendor)
    })),
    // Reviewing an approval is a mutation of workspace state.
    canReview: canMutate,
    canMutate,
    isEmpty: (activeAgents ?? 0) === 0 && outcome.total === 0 && (pendingApprovals ?? 0) === 0
  };
}

export function resolveOverviewRole(role: string | null | undefined): WorkspaceRole | null {
  return role ? resolveWorkspaceRole(role) : null;
}
