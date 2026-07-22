import {
  isBindableAgentAction,
  isValidBoundApprovalFields,
  LEGACY_UNBOUND_APPROVAL_MESSAGE
} from "@/lib/approvalIntent";
import { emitApprovalApproved, emitApprovalDenied } from "@/lib/approvals/emitLifecycle";
import {
  canApproveRequest,
  canDenyRequest,
  type WorkspaceActor
} from "@/lib/delegatedAuth";
import {
  approvalRepository as ApprovalRequest,
  APPROVAL_GRANT_TTL_MS
} from "@/lib/repositories/approvals";

export type ResolveApprovalDecision = "approve" | "deny";

export type ResolveApprovalResult =
  | {
      ok: true;
      decision: ResolveApprovalDecision;
      approvalId: string;
      grantExpiresAt?: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type ApprovalLean = {
  approvalId: string;
  accountId?: string | null;
  developerUserId?: string | null;
  kind?: string | null;
  agentId?: string | null;
  permissionId?: string | null;
  action: string;
  vendor?: string | null;
  amount?: number | null;
  argumentPreview?: string | null;
  argumentKind?: string | null;
  argumentFingerprint?: string | null;
  requiredAuthorityLevel?: number | null;
  requestId?: string | null;
  status?: string | null;
};

/**
 * Shared approve/deny mutation used by dashboard routes and Slack interactions.
 */
export async function resolveApprovalDecision(input: {
  actor: WorkspaceActor;
  approvalId: string;
  decision: ResolveApprovalDecision;
}): Promise<ResolveApprovalResult> {
  const { actor, approvalId, decision } = input;

  const approval = (await ApprovalRequest.findOne({
    approvalId,
    accountId: actor.accountId,
    status: "pending"
  }).lean()) as ApprovalLean | null;

  if (!approval) {
    return { ok: false, status: 404, error: "Approval request not found or already resolved." };
  }

  if (decision === "approve") {
    if (!canApproveRequest(actor, approval)) {
      return { ok: false, status: 403, error: "You are not authorized to approve this request." };
    }
    if (
      approval.kind !== "managed_profile_pause" &&
      isBindableAgentAction(approval.action) &&
      !isValidBoundApprovalFields(approval)
    ) {
      return { ok: false, status: 409, error: LEGACY_UNBOUND_APPROVAL_MESSAGE };
    }

    const now = new Date();
    const grantExpiresAt = new Date(now.getTime() + APPROVAL_GRANT_TTL_MS);
    const result = await ApprovalRequest.updateOne(
      { approvalId, accountId: actor.accountId, status: "pending" },
      {
        $set: {
          status: "approved",
          resolvedBy: actor.userId,
          resolvedAt: now,
          grantExpiresAt
        }
      }
    );
    if (result.matchedCount !== 1) {
      return { ok: false, status: 404, error: "Approval request not found or already resolved." };
    }

    await emitApprovalApproved({
      accountId: approval.accountId ?? actor.accountId,
      developerUserId: approval.developerUserId,
      approvalId,
      kind: approval.kind,
      agentId: approval.agentId,
      permissionId: approval.permissionId,
      action: approval.action,
      vendor: approval.vendor,
      amount: approval.amount,
      argumentPreview: approval.argumentPreview,
      requiredAuthorityLevel: approval.requiredAuthorityLevel,
      grantExpiresAt,
      resolvedBy: actor.userId,
      requestId: approval.requestId
    });

    return {
      ok: true,
      decision: "approve",
      approvalId,
      grantExpiresAt: grantExpiresAt.toISOString()
    };
  }

  if (!canDenyRequest(actor, approval)) {
    return { ok: false, status: 403, error: "You are not authorized to deny this request." };
  }

  const now = new Date();
  const result = await ApprovalRequest.updateOne(
    { approvalId, accountId: actor.accountId, status: "pending" },
    {
      $set: {
        status: "denied",
        resolvedBy: actor.userId,
        resolvedAt: now
      }
    }
  );
  if (result.matchedCount !== 1) {
    return { ok: false, status: 404, error: "Approval request not found or already resolved." };
  }

  await emitApprovalDenied({
    accountId: approval.accountId ?? actor.accountId,
    developerUserId: approval.developerUserId,
    approvalId,
    kind: approval.kind,
    agentId: approval.agentId,
    permissionId: approval.permissionId,
    action: approval.action,
    vendor: approval.vendor,
    amount: approval.amount,
    argumentPreview: approval.argumentPreview,
    requiredAuthorityLevel: approval.requiredAuthorityLevel,
    resolvedBy: actor.userId,
    requestId: approval.requestId
  });

  return { ok: true, decision: "deny", approvalId };
}
