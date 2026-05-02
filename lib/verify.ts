import { createPublicId } from "@/lib/ids";
import Permission, { type PermissionDocument } from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";

type VerifyInput = {
  agentId: string;
  action: string;
  amount?: number;
  vendor?: string;
};

type VerificationDecision = {
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
};

function isExpired(permission: PermissionDocument) {
  const expiresAt = permission.constraints?.expiresAt;
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
}

function evaluatePermission(permission: PermissionDocument | null, input: VerifyInput) {
  if (!permission) {
    return {
      allowed: false,
      reason: "No active permission exists for this action.",
      risk: "high"
    } satisfies VerificationDecision;
  }

  if (permission.status === "revoked") {
    return {
      allowed: false,
      reason: "Permission has been revoked.",
      risk: "high"
    } satisfies VerificationDecision;
  }

  if (isExpired(permission)) {
    return {
      allowed: false,
      reason: "Permission has expired.",
      risk: "high"
    } satisfies VerificationDecision;
  }

  const maxAmount = permission.constraints?.maxAmount;
  if (typeof maxAmount === "number" && input.amount === undefined) {
    return {
      allowed: false,
      reason: "amount is required for permissions with a maxAmount constraint.",
      risk: "high"
    } satisfies VerificationDecision;
  }

  if (typeof maxAmount === "number" && input.amount !== undefined && input.amount > maxAmount) {
    return {
      allowed: false,
      reason: "Amount exceeds maxAmount constraint.",
      risk: "high"
    } satisfies VerificationDecision;
  }

  const allowedVendors = permission.constraints?.allowedVendors ?? [];
  if (allowedVendors.length > 0) {
    if (!input.vendor || !allowedVendors.includes(input.vendor)) {
      return {
        allowed: false,
        reason: "Vendor is not included in allowedVendors constraint.",
        risk: "high"
      } satisfies VerificationDecision;
    }
  }

  return {
    allowed: true,
    reason: "Action allowed by active permission.",
    risk: "low"
  } satisfies VerificationDecision;
}

export async function verifyAction(input: VerifyInput) {
  const permission =
    (await Permission.findOne({
      agentId: input.agentId,
      action: input.action
    }).sort({ createdAt: -1 })) ?? null;

  const decision = evaluatePermission(permission, input);

  await VerificationLog.create({
    logId: createPublicId("log"),
    agentId: input.agentId,
    action: input.action,
    amount: input.amount,
    vendor: input.vendor,
    allowed: decision.allowed,
    reason: decision.reason,
    risk: decision.risk
  });

  return decision;
}
