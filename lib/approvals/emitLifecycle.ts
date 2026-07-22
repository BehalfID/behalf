import { createWebhookEvent, emitWebhookEvent, type WebhookEventType } from "@/lib/webhooks";
import { dispatchCollaborationEvent } from "@/lib/integrations/collaboration/dispatcher";

export type ApprovalLifecycleKind = "agent_action" | "managed_profile_pause";

export type ApprovalLifecycleStatus = "pending" | "approved" | "denied" | "used";

/**
 * Stable payload for approval.* webhook events. Safe for Slack/Teams adapters
 * and customer receivers — no secrets, no policyContext.
 */
export type ApprovalLifecycleData = {
  approvalId: string;
  kind: ApprovalLifecycleKind;
  status: ApprovalLifecycleStatus;
  agentId?: string;
  permissionId?: string;
  action: string;
  vendor?: string;
  amount?: number;
  argumentPreview?: string;
  requiredAuthorityLevel?: number;
  grantExpiresAt?: string;
  resolvedBy?: string;
  requestId?: string;
  dashboardUrl: string;
};

export type ApprovalLifecycleInput = {
  accountId?: string | null;
  developerUserId?: string | null;
  approvalId: string;
  kind?: ApprovalLifecycleKind | string | null;
  status: ApprovalLifecycleStatus;
  agentId?: string | null;
  permissionId?: string | null;
  action: string;
  vendor?: string | null;
  amount?: number | null;
  argumentPreview?: string | null;
  requiredAuthorityLevel?: number | null;
  grantExpiresAt?: Date | string | null;
  resolvedBy?: string | null;
  requestId?: string | null;
};

const LIFECYCLE_EVENT_BY_STATUS: Record<ApprovalLifecycleStatus, WebhookEventType> = {
  pending: "approval.requested",
  approved: "approval.approved",
  denied: "approval.denied",
  used: "approval.used"
};

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    "https://behalfid.com"
  ).replace(/\/$/, "");
}

export function buildApprovalDashboardUrl(approvalId: string) {
  return `${appBaseUrl()}/dashboard/approvals?approvalId=${encodeURIComponent(approvalId)}`;
}

function normalizeKind(kind: ApprovalLifecycleInput["kind"]): ApprovalLifecycleKind {
  return kind === "managed_profile_pause" ? "managed_profile_pause" : "agent_action";
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function buildApprovalLifecycleData(input: ApprovalLifecycleInput): ApprovalLifecycleData {
  const data: ApprovalLifecycleData = {
    approvalId: input.approvalId,
    kind: normalizeKind(input.kind),
    status: input.status,
    action: input.action,
    dashboardUrl: buildApprovalDashboardUrl(input.approvalId)
  };

  if (input.agentId) data.agentId = input.agentId;
  if (input.permissionId) data.permissionId = input.permissionId;
  if (input.vendor) data.vendor = input.vendor;
  if (typeof input.amount === "number") data.amount = input.amount;
  if (input.argumentPreview) data.argumentPreview = input.argumentPreview;
  if (typeof input.requiredAuthorityLevel === "number") {
    data.requiredAuthorityLevel = input.requiredAuthorityLevel;
  }
  const grantExpiresAt = toIso(input.grantExpiresAt);
  if (grantExpiresAt) data.grantExpiresAt = grantExpiresAt;
  if (input.resolvedBy) data.resolvedBy = input.resolvedBy;
  if (input.requestId) data.requestId = input.requestId;

  return data;
}

async function emitApprovalLifecycle(
  status: ApprovalLifecycleStatus,
  input: Omit<ApprovalLifecycleInput, "status">
) {
  const eventType = LIFECYCLE_EVENT_BY_STATUS[status];
  const data = buildApprovalLifecycleData({ ...input, status });

  try {
    await emitWebhookEvent(
      createWebhookEvent(input.accountId, eventType, data, input.developerUserId)
    );
  } catch {
    // Lifecycle webhooks must never fail closed on the approval/verify path.
  }

  try {
    await dispatchCollaborationEvent({
      accountId: input.accountId,
      type: eventType,
      data
    });
  } catch {
    // Collaboration fan-out must never fail closed.
  }
}

export async function emitApprovalRequested(input: Omit<ApprovalLifecycleInput, "status">) {
  await emitApprovalLifecycle("pending", input);
}

export async function emitApprovalApproved(input: Omit<ApprovalLifecycleInput, "status">) {
  await emitApprovalLifecycle("approved", input);
}

export async function emitApprovalDenied(input: Omit<ApprovalLifecycleInput, "status">) {
  await emitApprovalLifecycle("denied", input);
}

export async function emitApprovalUsed(input: Omit<ApprovalLifecycleInput, "status">) {
  await emitApprovalLifecycle("used", input);
}
