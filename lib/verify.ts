import { createPublicId } from "@/lib/ids";
import Agent from "@/models/Agent";
import Permission, { type PermissionDocument } from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";

type VerifyInput = {
  agentId: string;
  accountId?: string;
  developerUserId?: string;
  agentStatus?: string | null;
  action: string;
  amount?: number;
  vendor?: string;
  metadata?: Record<string, unknown>;
  enforcementDenyReason?: string;
};

type VerificationDecision = {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
};

function isExpired(permission: PermissionDocument) {
  const expiresAt = permission.constraints?.expiresAt;
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
}

function evaluatePermission(permission: PermissionDocument | null, input: VerifyInput) {
  if (input.agentStatus === "disabled") {
    return {
      allowed: false,
      reason: "Agent is disabled.",
      risk: "high"
    } satisfies Omit<VerificationDecision, "requestId">;
  }

  if (!permission) {
    return {
      allowed: false,
      reason: "No active permission exists for this action.",
      risk: "high"
    } satisfies Omit<VerificationDecision, "requestId">;
  }

  if (permission.status === "revoked") {
    return {
      allowed: false,
      reason: "Permission has been revoked.",
      risk: "high"
    } satisfies Omit<VerificationDecision, "requestId">;
  }

  if (isExpired(permission)) {
    return {
      allowed: false,
      reason: "Permission has expired.",
      risk: "high"
    } satisfies Omit<VerificationDecision, "requestId">;
  }

  const maxAmount = permission.constraints?.maxAmount;
  if (typeof maxAmount === "number" && input.amount === undefined) {
    return {
      allowed: false,
      reason: "amount is required for permissions with a maxAmount constraint.",
      risk: "high"
    } satisfies Omit<VerificationDecision, "requestId">;
  }

  if (typeof maxAmount === "number" && input.amount !== undefined && input.amount > maxAmount) {
    return {
      allowed: false,
      reason: "Amount exceeds maxAmount constraint.",
      risk: "high"
    } satisfies Omit<VerificationDecision, "requestId">;
  }

  const allowedVendors = permission.constraints?.allowedVendors ?? [];
  if (allowedVendors.length > 0) {
    if (!input.vendor || !allowedVendors.includes(input.vendor)) {
      return {
        allowed: false,
        reason: "Vendor is not included in allowedVendors constraint.",
        risk: "high"
      } satisfies Omit<VerificationDecision, "requestId">;
    }
  }

  return {
    allowed: true,
    reason: "Action allowed by active permission.",
    risk: "low"
  } satisfies Omit<VerificationDecision, "requestId">;
}

async function findNewestMatchingPermission(input: VerifyInput) {
  if (input.agentStatus === "disabled") return null;
  return ((await Permission.findOne({
    agentId: input.agentId,
    action: input.action
  }).sort({ createdAt: -1 })) ?? null);
}

export async function verifyAction(input: VerifyInput) {
  const requestId = createPublicId("req");
  const permission = await findNewestMatchingPermission(input);

  const decision = evaluatePermission(permission, input);
  const finalDecision =
    decision.allowed && input.enforcementDenyReason
      ? ({
          allowed: false,
          reason: input.enforcementDenyReason,
          risk: "high"
        } satisfies Omit<VerificationDecision, "requestId">)
      : decision;
  const now = new Date();

  await Agent.updateOne({ agentId: input.agentId }, { $set: { lastUsedAt: now } });

  if (permission) {
    await Permission.updateOne(
      { permissionId: permission.permissionId },
      { $set: { lastUsedAt: now } }
    );
  }

  const logMetadata =
    process.env.BEHALFID_LOG_METADATA === "false" ? undefined : input.metadata;

  await VerificationLog.create({
    logId: createPublicId("log"),
    requestId,
    accountId: input.accountId,
    developerUserId: input.developerUserId,
    agentId: input.agentId,
    permissionId: permission?.permissionId ?? null,
    action: input.action,
    amount: input.amount,
    vendor: input.vendor,
    allowed: finalDecision.allowed,
    reason: finalDecision.reason,
    risk: finalDecision.risk,
    metadata: logMetadata
  });

  return { requestId, permissionId: permission?.permissionId ?? null, ...finalDecision };
}

export async function previewVerification(input: VerifyInput) {
  const requestId = createPublicId("req");
  const permission = await findNewestMatchingPermission(input);
  const decision = evaluatePermission(permission, input);

  return { requestId, permissionId: permission?.permissionId ?? null, ...decision };
}
