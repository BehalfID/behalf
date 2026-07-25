import ApprovalRequest from "@/models/ApprovalRequest";
import VerificationLog from "@/models/VerificationLog";
import {
  branchBucket,
  environmentBucket,
  extractAuthorizationContext
} from "@/lib/adaptiveDelegation/context";
import { isSliceProtected } from "@/lib/adaptiveDelegation/contextMatching";
import type {
  ApprovalPatternAggregate,
  ContextPatternAggregate
} from "@/lib/adaptiveDelegation/types";

type ApprovalLean = {
  approvalId: string;
  requestId?: string | null;
  accountId?: string | null;
  agentId?: string | null;
  action: string;
  vendor?: string | null;
  status: string;
  permissionId?: string | null;
  createdAt?: Date;
  resolvedAt?: Date | null;
  usedAt?: Date | null;
};

type LogLean = {
  requestId?: string | null;
  agentId: string;
  action: string;
  vendor?: string | null;
  approvalRequired?: boolean | null;
  allowed: boolean;
  reason: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
};

function resourceKey(vendor: string | null | undefined): string | null {
  if (!vendor) return null;
  const trimmed = vendor.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

function patternMapKey(agentId: string, action: string, resource: string | null): string {
  return `${agentId}\0${action.trim().toLowerCase()}\0${resource ?? ""}`;
}

function ensurePattern(
  map: Map<string, ApprovalPatternAggregate>,
  accountId: string,
  agentId: string,
  action: string,
  resource: string | null
): ApprovalPatternAggregate {
  const key = patternMapKey(agentId, action, resource);
  const existing = map.get(key);
  if (existing) return existing;
  const created: ApprovalPatternAggregate = {
    accountId,
    agentId,
    action,
    resource,
    approvedCount: 0,
    deniedCount: 0,
    usedCount: 0,
    pendingCount: 0,
    approvalRequiredLogCount: 0,
    resources: resource ? [resource] : [],
    firstSeenAt: null,
    lastSeenAt: null,
    sampleApprovalIds: [],
    permissionId: null
  };
  map.set(key, created);
  return created;
}

function touchDates(
  pattern: { firstSeenAt: Date | null; lastSeenAt: Date | null },
  date: Date | null | undefined
) {
  if (!date) return;
  if (!pattern.firstSeenAt || date < pattern.firstSeenAt) pattern.firstSeenAt = date;
  if (!pattern.lastSeenAt || date > pattern.lastSeenAt) pattern.lastSeenAt = date;
}

function ensureContextPattern(
  map: Map<string, ContextPatternAggregate>,
  input: {
    accountId: string;
    agentId: string;
    action: string;
    dimension: ContextPatternAggregate["dimension"];
    value: string;
  }
): ContextPatternAggregate {
  const key = `${input.agentId}\0${input.action}\0${input.dimension}\0${input.value}`;
  const existing = map.get(key);
  if (existing) return existing;
  const created: ContextPatternAggregate = {
    accountId: input.accountId,
    agentId: input.agentId,
    action: input.action,
    dimension: input.dimension,
    value: input.value,
    protected: isSliceProtected(input.dimension, input.value),
    approvedCount: 0,
    deniedCount: 0,
    usedCount: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    sampleApprovalIds: []
  };
  map.set(key, created);
  return created;
}

async function loadHistoryRows(options: {
  accountId: string;
  lookbackDays: number;
  agentId?: string;
}) {
  const since = new Date(Date.now() - options.lookbackDays * 24 * 60 * 60 * 1000);
  const accountFilter = { accountId: options.accountId };
  const agentFilter = options.agentId ? { agentId: options.agentId } : {};

  const [approvals, logs] = await Promise.all([
    ApprovalRequest.find({
      ...accountFilter,
      ...agentFilter,
      $or: [{ kind: "agent_action" }, { kind: { $exists: false } }, { kind: null }],
      createdAt: { $gte: since }
    })
      .select(
        "approvalId requestId accountId agentId action vendor status permissionId createdAt resolvedAt usedAt"
      )
      .lean<ApprovalLean[]>(),
    VerificationLog.find({
      ...accountFilter,
      ...agentFilter,
      createdAt: { $gte: since }
    })
      .select("requestId agentId action vendor approvalRequired allowed reason metadata createdAt")
      .lean<LogLean[]>()
  ]);

  return { approvals, logs };
}

/**
 * Aggregate human approval decisions and verification approval-required volume
 * into deterministic patterns for AdaptiveDelegationEngine.
 */
export async function loadApprovalPatterns(options: {
  accountId: string;
  lookbackDays: number;
  agentId?: string;
}): Promise<ApprovalPatternAggregate[]> {
  const { approvals, logs } = await loadHistoryRows(options);
  const map = new Map<string, ApprovalPatternAggregate>();

  for (const approval of approvals) {
    if (!approval.agentId || !approval.action) continue;

    const resource = resourceKey(approval.vendor);
    const pattern = ensurePattern(
      map,
      options.accountId,
      approval.agentId,
      approval.action,
      resource
    );

    if (approval.status === "approved" || approval.status === "used") {
      pattern.approvedCount += 1;
      if (approval.status === "used") pattern.usedCount += 1;
    } else if (approval.status === "denied") {
      pattern.deniedCount += 1;
    } else if (approval.status === "pending") {
      pattern.pendingCount += 1;
    }

    if (approval.permissionId && !pattern.permissionId) {
      pattern.permissionId = approval.permissionId;
    }
    if (pattern.sampleApprovalIds.length < 8) {
      pattern.sampleApprovalIds.push(approval.approvalId);
    }
    if (resource && !pattern.resources.includes(resource)) {
      pattern.resources.push(resource);
    }
    touchDates(pattern, approval.resolvedAt ?? approval.usedAt ?? approval.createdAt);
  }

  for (const log of logs) {
    if (!log.agentId || !log.action) continue;
    if (!(log.approvalRequired || /requires approval|approval required/i.test(log.reason))) continue;
    const resource = resourceKey(log.vendor);
    const pattern = ensurePattern(map, options.accountId, log.agentId, log.action, resource);
    pattern.approvalRequiredLogCount += 1;
    if (resource && !pattern.resources.includes(resource)) {
      pattern.resources.push(resource);
    }
    touchDates(pattern, log.createdAt);
  }

  return [...map.values()];
}

/**
 * Stage 5 — aggregate approval outcomes by metadata context dimensions.
 * Uses VerificationLog.metadata (policyContext is never persisted).
 */
export async function loadContextPatterns(options: {
  accountId: string;
  lookbackDays: number;
  agentId?: string;
}): Promise<ContextPatternAggregate[]> {
  const { approvals, logs } = await loadHistoryRows(options);
  const approvalByRequestId = new Map<string, ApprovalLean>();
  for (const approval of approvals) {
    if (approval.requestId) approvalByRequestId.set(approval.requestId, approval);
  }

  const map = new Map<string, ContextPatternAggregate>();

  for (const log of logs) {
    if (!log.agentId || !log.action) continue;
    const context = extractAuthorizationContext(log.metadata ?? null);
    const slices: Array<{ dimension: ContextPatternAggregate["dimension"]; value: string }> = [];

    const branch = branchBucket(context.branch);
    if (branch) slices.push({ dimension: "branch", value: branch });
    const environment = environmentBucket(context.environment);
    if (environment) slices.push({ dimension: "environment", value: environment });
    if (context.repository) slices.push({ dimension: "repository", value: context.repository });

    if (slices.length === 0) continue;

    const approval = log.requestId ? approvalByRequestId.get(log.requestId) : undefined;
    let outcome: "approved" | "denied" | "used" | null = null;
    if (approval) {
      if (approval.status === "approved" || approval.status === "used") {
        outcome = approval.status === "used" ? "used" : "approved";
      } else if (approval.status === "denied") {
        outcome = "denied";
      }
    } else if (log.allowed && !log.approvalRequired) {
      outcome = "approved";
    } else if (!log.allowed && !log.approvalRequired) {
      outcome = "denied";
    }

    if (!outcome) continue;

    for (const slice of slices) {
      const pattern = ensureContextPattern(map, {
        accountId: options.accountId,
        agentId: log.agentId,
        action: log.action,
        dimension: slice.dimension,
        value: slice.value
      });
      if (outcome === "approved" || outcome === "used") {
        pattern.approvedCount += 1;
        if (outcome === "used") pattern.usedCount += 1;
      } else {
        pattern.deniedCount += 1;
      }
      if (approval && pattern.sampleApprovalIds.length < 8) {
        pattern.sampleApprovalIds.push(approval.approvalId);
      }
      touchDates(pattern, approval?.resolvedAt ?? approval?.usedAt ?? log.createdAt);
    }
  }

  return [...map.values()];
}
