export type LogRisk = "low" | "medium" | "high";
export type LogDecision = "allowed" | "denied" | "approval_required";
export type DecisionTone = "allowed" | "denied" | "approval";

export type OpsLog = {
  requestId: string;
  agentId: string;
  agentName?: string | null;
  permissionId?: string | null;
  action: string;
  amount?: number;
  vendor?: string | null;
  environment?: string | null;
  allowed: boolean;
  approvalRequired?: boolean;
  decision?: LogDecision;
  reason: string;
  risk: LogRisk;
  shadow?: boolean;
  approvalId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
};

export type OpsLogSummary = {
  total: number;
  allowed: number;
  denied: number;
  highRisk: number;
  approvalRequired: number;
  topDeniedAction: string | null;
  topVendor: string | null;
};

export type OpsApprovalRequest = {
  approvalId: string;
  requestId: string;
  kind?: "agent_action" | "managed_profile_pause" | null;
  agentId: string;
  agentName?: string | null;
  requesterName?: string | null;
  permissionId: string;
  action: string;
  vendor?: string | null;
  amount?: number | null;
  status: "pending" | "approved" | "denied" | "used";
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  grantExpiresAt?: string | null;
  createdAt?: string;
  requiredAuthorityLevel?: number;
  requiredRoleLabel?: string;
  canApprove?: boolean;
  canDeny?: boolean;
  approveBlockReason?: string | null;
  denyBlockReason?: string | null;
  pauseTool?: string | null;
  pauseRepo?: string | null;
  pauseBranch?: string | null;
  pauseDeviceId?: string | null;
  pauseScope?: "current_repo" | "all" | null;
  requestedDurationMinutes?: number | null;
  pauseReason?: string | null;
  contextReason?: string | null;
};

export function isManagedProfilePauseApproval(
  req: Pick<OpsApprovalRequest, "kind" | "action">
): boolean {
  return req.kind === "managed_profile_pause" || req.action === "managed_profile_pause";
}

export function formatPauseApprovalTitle(req: OpsApprovalRequest): string {
  return "Managed profile pause requested";
}

export function formatPauseApprovalDetails(req: OpsApprovalRequest): string {
  const parts: string[] = [];
  if (req.approvalId) parts.push(`Approval: ${req.approvalId}`);
  if (req.requesterName) parts.push(`Requester: ${req.requesterName}`);
  if (req.pauseTool) parts.push(`Tool: ${req.pauseTool}`);
  if (req.pauseRepo) parts.push(`Repo: ${req.pauseRepo}`);
  else if (req.pauseScope === "all") parts.push("Repo: all repos");
  if (req.pauseBranch) parts.push(`Branch: ${req.pauseBranch}`);
  if (req.pauseDeviceId) parts.push(`Device: ${req.pauseDeviceId}`);
  if (typeof req.requestedDurationMinutes === "number") {
    parts.push(`Duration: ${req.requestedDurationMinutes}m`);
  }
  if (req.pauseReason) parts.push(`Pause reason: ${req.pauseReason}`);
  if (req.contextReason) parts.push(`Policy context: ${req.contextReason}`);
  return parts.join(" · ");
}

export function getLogDecision(log: Pick<OpsLog, "allowed" | "approvalRequired" | "reason" | "decision">): LogDecision {
  if (log.decision) return log.decision;
  if (log.allowed) return "allowed";
  if (log.approvalRequired || /requires approval|approval required|approval before execution/i.test(log.reason)) {
    return "approval_required";
  }
  return "denied";
}

export function logDecisionTone(log: Pick<OpsLog, "allowed" | "approvalRequired" | "reason" | "decision">): DecisionTone {
  const decision = getLogDecision(log);
  if (decision === "allowed") return "allowed";
  if (decision === "approval_required") return "approval";
  return "denied";
}

export function logDecisionLabel(log: Pick<OpsLog, "allowed" | "approvalRequired" | "reason" | "decision">) {
  const decision = getLogDecision(log);
  if (decision === "allowed") return "Allowed";
  if (decision === "approval_required") return "Requires approval";
  return "Denied";
}

export function logDecisionShortLabel(log: Pick<OpsLog, "allowed" | "approvalRequired" | "reason" | "decision">) {
  const decision = getLogDecision(log);
  if (decision === "allowed") return "Allowed";
  if (decision === "approval_required") return "Needs approval";
  return "Denied";
}

export function approvalRequiredMetricLabel(count: number) {
  return count === 1 ? "requires approval" : "require approval";
}

export function formatOpsTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

export function formatOpsDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString();
}

export function formatActionLabel(action: string, vendor?: string | null) {
  const base = action.replace(/_/g, " ");
  return vendor ? `${base} · ${vendor}` : base;
}
