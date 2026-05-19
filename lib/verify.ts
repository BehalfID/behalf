import { createPublicId } from "@/lib/ids";
import { recordAgentKeyUse } from "@/lib/auth";
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

function listIncludes(values: string[] | undefined, value: string) {
  return (values ?? []).some((item) => item === value);
}

function listValueMatches(values: string[] | undefined, value: string | undefined) {
  if (!value) return false;
  return (values ?? [])
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean)
    .some((item) => item === value);
}

function permissionMatchesInput(permission: PermissionDocument, input: VerifyInput) {
  return (
    permission.action === input.action ||
    listIncludes(permission.allowedActions, input.action) ||
    listIncludes(permission.blockedActions, input.action)
  );
}

function isActiveCandidate(permission: PermissionDocument) {
  return permission.status === "active" && !isExpired(permission);
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

  if (!permissionMatchesInput(permission, input)) {
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

  if (listIncludes(permission.blockedActions, input.action)) {
    return {
      allowed: false,
      reason: "Action is blocked by this permission.",
      risk: "high"
    } satisfies Omit<VerificationDecision, "requestId">;
  }

  const allowedActions = permission.allowedActions ?? [];
  if (
    allowedActions.length > 0 &&
    !allowedActions.includes(input.action)
  ) {
    return {
      allowed: false,
      reason: "Action is not included in allowedActions.",
      risk: "high"
    } satisfies Omit<VerificationDecision, "requestId">;
  }

  if (permission.resource && !listValueMatches([permission.resource], input.vendor)) {
    return {
      allowed: false,
      reason: "Resource does not match permission resource.",
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

  if (permission.requiresApproval) {
    return {
      allowed: false,
      reason: "Permission requires approval before execution.",
      risk: "medium"
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
    if (!listValueMatches(allowedVendors, input.vendor)) {
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

function evaluatePermissions(permissions: PermissionDocument[], input: VerifyInput) {
  if (input.agentStatus === "disabled") {
    return {
      permission: null,
      decision: evaluatePermission(null, input)
    };
  }

  const matchingPermissions = permissions.filter((permission) =>
    permissionMatchesInput(permission, input)
  );
  const activePermissions = matchingPermissions.filter(isActiveCandidate);

  const blockingPermission = activePermissions.find((permission) =>
    listIncludes(permission.blockedActions, input.action)
  );
  if (blockingPermission) {
    return {
      permission: blockingPermission,
      decision: evaluatePermission(blockingPermission, input)
    };
  }

  for (const permission of activePermissions) {
    const decision = evaluatePermission(permission, input);
    if (decision.allowed) {
      return { permission, decision };
    }
  }

  const deniedActivePermission = activePermissions[0] ?? null;
  if (deniedActivePermission) {
    return {
      permission: deniedActivePermission,
      decision: evaluatePermission(deniedActivePermission, input)
    };
  }

  const inactivePermission = matchingPermissions[0] ?? null;
  return {
    permission: inactivePermission,
    decision: evaluatePermission(inactivePermission, input)
  };
}

async function findMatchingPermissions(input: VerifyInput) {
  if (input.agentStatus === "disabled") return [];
  return Permission.find({
    agentId: input.agentId,
    $or: [
      { action: input.action },
      { allowedActions: input.action },
      { blockedActions: input.action }
    ]
  }).sort({ createdAt: -1 });
}

export async function verifyAction(input: VerifyInput) {
  const requestId = createPublicId("req");
  let permission: PermissionDocument | null = null;
  let decision: Omit<VerificationDecision, "requestId">;

  try {
    const permissions = await findMatchingPermissions(input);
    const result = evaluatePermissions(permissions, input);
    permission = result.permission;
    decision = result.decision;
  } catch {
    decision = {
      allowed: false,
      reason: "Verification failed closed during permission lookup.",
      risk: "high"
    };
  }

  const finalDecision =
    decision.allowed && input.enforcementDenyReason
      ? ({
          allowed: false,
          reason: input.enforcementDenyReason,
          risk: "high"
        } satisfies Omit<VerificationDecision, "requestId">)
      : decision;
  const now = new Date();

  recordAgentKeyUse(input.agentId);

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
  const permissions = await findMatchingPermissions(input);
  const result = evaluatePermissions(permissions, input);
  const permission = result.permission;
  const decision = result.decision;

  return { requestId, permissionId: permission?.permissionId ?? null, ...decision };
}
