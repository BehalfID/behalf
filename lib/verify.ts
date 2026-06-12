import { createPublicId } from "@/lib/ids";
import { recordAgentKeyUse } from "@/lib/auth";
import ApprovalRequest from "@/models/ApprovalRequest";
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
  shadow?: boolean;
};

type ShadowDecision = {
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
};

type VerificationDecision = {
  requestId: string;
  allowed: boolean;
  approvalRequired?: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  shadow?: boolean;
  shadowDecision?: ShadowDecision;
};

type RawDecision = Omit<VerificationDecision, "requestId">;

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

/**
 * Hard constraints that can never be bypassed — not even by a human-approved
 * grant. Returns a deny decision if any constraint fails, or null if the
 * request passes every hard constraint.
 */
function evaluateHardConstraints(
  permission: PermissionDocument | null,
  input: VerifyInput
): RawDecision | null {
  if (input.agentStatus === "disabled") {
    return { allowed: false, reason: "Agent is disabled.", risk: "high" };
  }

  if (!permission) {
    return { allowed: false, reason: "No active permission exists for this action.", risk: "high" };
  }

  if (!permissionMatchesInput(permission, input)) {
    return { allowed: false, reason: "No active permission exists for this action.", risk: "high" };
  }

  if (permission.status === "revoked") {
    return { allowed: false, reason: "Permission has been revoked.", risk: "high" };
  }

  if (isExpired(permission)) {
    return { allowed: false, reason: "Permission has expired.", risk: "high" };
  }

  if (listIncludes(permission.blockedActions, input.action)) {
    return { allowed: false, reason: "Action is blocked by this permission.", risk: "high" };
  }

  const allowedActions = permission.allowedActions ?? [];
  if (allowedActions.length > 0 && !allowedActions.includes(input.action)) {
    return { allowed: false, reason: "Action is not included in allowedActions.", risk: "high" };
  }

  if (permission.resource && !listValueMatches([permission.resource], input.vendor)) {
    return { allowed: false, reason: "Resource does not match permission resource.", risk: "high" };
  }

  const maxAmount = permission.constraints?.maxAmount;
  if (typeof maxAmount === "number" && input.amount === undefined) {
    return { allowed: false, reason: "amount is required for permissions with a maxAmount constraint.", risk: "high" };
  }

  if (typeof maxAmount === "number" && input.amount !== undefined && input.amount > maxAmount) {
    return { allowed: false, reason: "Amount exceeds maxAmount constraint.", risk: "high" };
  }

  const allowedVendors = permission.constraints?.allowedVendors ?? [];
  if (allowedVendors.length > 0) {
    if (!listValueMatches(allowedVendors, input.vendor)) {
      return { allowed: false, reason: "Vendor is not included in allowedVendors constraint.", risk: "high" };
    }
  }

  return null;
}

function evaluatePermission(permission: PermissionDocument | null, input: VerifyInput): RawDecision {
  // Hard constraints are evaluated first so that the approval gate can never
  // bypass them. An approved grant only satisfies requiresApproval; it does
  // not override blocked actions, revocation, expiry, maxAmount, vendor
  // restrictions, or resource matching.
  const hardDeny = evaluateHardConstraints(permission, input);
  if (hardDeny) return hardDeny;

  if (permission?.requiresApproval) {
    return {
      allowed: false,
      approvalRequired: true,
      reason: "Permission requires approval before execution.",
      risk: "medium"
    };
  }

  return { allowed: true, reason: "Action allowed by active permission.", risk: "low" };
}

function evaluatePermissions(permissions: PermissionDocument[], input: VerifyInput) {
  if (input.agentStatus === "disabled") {
    return { permission: null, decision: evaluatePermission(null, input) };
  }

  const matchingPermissions = permissions.filter((permission) =>
    permissionMatchesInput(permission, input)
  );
  const activePermissions = matchingPermissions.filter(isActiveCandidate);

  const blockingPermission = activePermissions.find((permission) =>
    listIncludes(permission.blockedActions, input.action)
  );
  if (blockingPermission) {
    return { permission: blockingPermission, decision: evaluatePermission(blockingPermission, input) };
  }

  for (const permission of activePermissions) {
    const decision = evaluatePermission(permission, input);
    if (decision.allowed) {
      return { permission, decision };
    }
  }

  const deniedActivePermission = activePermissions[0] ?? null;
  if (deniedActivePermission) {
    return { permission: deniedActivePermission, decision: evaluatePermission(deniedActivePermission, input) };
  }

  const inactivePermission = matchingPermissions[0] ?? null;
  return { permission: inactivePermission, decision: evaluatePermission(inactivePermission, input) };
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

type ApprovalGrantFields = {
  action?: string | null;
  vendor?: string | null;
  amount?: number | null;
};

/**
 * An approved grant is only valid for the exact action/vendor/amount that was
 * originally requested and approved. An approval for vendor=A never allows
 * vendor=B; an approval for amount=25 never allows amount=250; an approval for
 * action=purchase never allows action=deploy.
 */
function requestMatchesApprovalGrant(grant: ApprovalGrantFields, input: VerifyInput): boolean {
  return (
    (grant.action ?? null) === input.action &&
    (grant.vendor ?? null) === (input.vendor ?? null) &&
    (grant.amount ?? null) === (input.amount ?? null)
  );
}

/**
 * If there is an approved, non-expired grant matching this exact request
 * (agentId, permissionId, action, vendor, amount), mark it as used and return
 * true (allow the action).
 * Otherwise upsert a pending ApprovalRequest scoped to this exact request and
 * return false (keep denying).
 *
 * This gate is only reached after every hard constraint (blocked actions,
 * revocation, expiry, maxAmount, allowedVendors, resource matching) has
 * already passed — an approval can never override those.
 */
async function resolveApprovalGate(
  requestId: string,
  input: VerifyInput,
  permissionId: string
): Promise<{ granted: boolean; approvalId?: string }> {
  const now = new Date();

  // 1. Check for an approved, non-expired grant scoped to this exact request.
  //    (vendor/amount: null in the query also matches legacy documents where
  //    the field is absent.)
  const grant = await ApprovalRequest.findOne({
    agentId: input.agentId,
    permissionId,
    action: input.action,
    vendor: input.vendor ?? null,
    amount: input.amount ?? null,
    status: "approved",
    grantExpiresAt: { $gt: now }
  });

  // Defense in depth: re-validate the grant fields in code so a grant can
  // never be consumed by a request it was not approved for.
  if (grant && requestMatchesApprovalGrant(grant, input)) {
    // Mark the grant as used so it cannot be reused for another action
    await ApprovalRequest.updateOne(
      { approvalId: grant.approvalId },
      { $set: { status: "used", resolvedAt: now } }
    );
    return { granted: true };
  }

  // 2. Upsert a pending ApprovalRequest (idempotent — only creates if one
  // doesn't exist for this exact action/vendor/amount tuple).
  // new: true returns the document whether it was inserted or already existed,
  // so we always get back the stable approvalId for this request shape.
  const pending = await ApprovalRequest.findOneAndUpdate(
    {
      agentId: input.agentId,
      permissionId,
      action: input.action,
      vendor: input.vendor ?? null,
      amount: input.amount ?? null,
      status: "pending"
    },
    {
      $setOnInsert: {
        approvalId: createPublicId("apr"),
        requestId,
        accountId: input.accountId,
        developerUserId: input.developerUserId
      }
    },
    { upsert: true, new: true }
  );

  return { granted: false, approvalId: (pending?.approvalId as string | undefined) };
}

export async function verifyAction(input: VerifyInput) {
  const requestId = createPublicId("req");
  let permission: PermissionDocument | null = null;
  let decision: RawDecision;

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

  const now = new Date();
  const logMetadata =
    process.env.BEHALFID_LOG_METADATA === "false" ? undefined : input.metadata;

  // Shadow mode: evaluate policy, log the real decision, but never block execution.
  // Approval gates are skipped — no side effects should occur in shadow mode.
  if (input.shadow) {
    recordAgentKeyUse(input.agentId);

    if (permission) {
      await Permission.updateOne(
        { permissionId: permission.permissionId },
        { $set: { lastUsedAt: now } }
      );
    }

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
      allowed: decision.allowed,
      approvalRequired: decision.approvalRequired ?? false,
      reason: decision.reason,
      risk: decision.risk,
      metadata: logMetadata,
      shadow: true
    });

    return {
      requestId,
      permissionId: permission?.permissionId ?? null,
      allowed: true,
      approvalRequired: false,
      approvalId: null,
      shadow: true,
      shadowDecision: {
        allowed: decision.allowed,
        reason: decision.reason,
        risk: decision.risk
      } satisfies ShadowDecision,
      reason: decision.allowed
        ? "Shadow mode: action would have been allowed."
        : "Shadow mode: action would have been denied.",
      risk: decision.risk
    };
  }

  // Resolve approval gate: if the permission requires approval, check for a
  // granted approval or upsert a pending request.
  let approvalId: string | null = null;
  if (decision.approvalRequired && permission) {
    try {
      const gate = await resolveApprovalGate(requestId, input, permission.permissionId);
      if (gate.granted) {
        decision = { allowed: true, reason: "Action allowed by approved permission grant.", risk: "low" };
      } else {
        approvalId = gate.approvalId ?? null;
      }
    } catch {
      // Fail closed: if approval resolution fails, keep the denied decision
    }
  }

  const finalDecision =
    decision.allowed && input.enforcementDenyReason
      ? ({ allowed: false, reason: input.enforcementDenyReason, risk: "high" } satisfies RawDecision)
      : decision;

  recordAgentKeyUse(input.agentId);

  if (permission) {
    await Permission.updateOne(
      { permissionId: permission.permissionId },
      { $set: { lastUsedAt: now } }
    );
  }

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
    approvalRequired: finalDecision.approvalRequired ?? false,
    reason: finalDecision.reason,
    risk: finalDecision.risk,
    metadata: logMetadata
  });

  return {
    requestId,
    permissionId: permission?.permissionId ?? null,
    allowed: finalDecision.allowed,
    approvalRequired: finalDecision.approvalRequired ?? false,
    approvalId,
    reason: finalDecision.reason,
    risk: finalDecision.risk
  };
}

export async function previewVerification(input: VerifyInput) {
  const requestId = createPublicId("req");
  const permissions = await findMatchingPermissions(input);
  const result = evaluatePermissions(permissions, input);
  const permission = result.permission;
  const decision = result.decision;

  return {
    requestId,
    permissionId: permission?.permissionId ?? null,
    allowed: decision.allowed,
    approvalRequired: decision.approvalRequired ?? false,
    reason: decision.reason,
    risk: decision.risk
  };
}
