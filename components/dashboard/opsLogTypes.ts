export type LogRisk = "low" | "medium" | "high";
export type LogDecision = "allowed" | "denied" | "approval_required";

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
  agentId: string;
  agentName?: string | null;
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
};

export function logDecisionLabel(log: Pick<OpsLog, "allowed" | "approvalRequired" | "reason" | "decision">) {
  const decision = log.decision ?? (log.allowed ? "allowed" : log.approvalRequired ? "approval_required" : "denied");
  if (decision === "allowed") return "Allowed";
  if (decision === "approval_required") return "Requires approval";
  return "Denied";
}

export function logDecisionClass(log: Pick<OpsLog, "allowed" | "approvalRequired" | "reason" | "decision">) {
  const decision = log.decision ?? (log.allowed ? "allowed" : log.approvalRequired ? "approval_required" : "denied");
  if (decision === "allowed") return "ops-log-chip ops-log-chip--allowed";
  if (decision === "approval_required") return "ops-log-chip ops-log-chip--approval";
  return "ops-log-chip ops-log-chip--denied";
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
