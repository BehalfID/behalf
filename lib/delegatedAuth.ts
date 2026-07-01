import { jsonError } from "@/lib/responses";
import {
  AUTHORITY_LEVELS,
  getAuthorityLevelForRole,
  getRequiredRoleLabel,
  getRoleLabel,
  isWorkspaceRole,
  type WorkspaceRole
} from "@/lib/authority";
import { createPublicId } from "@/lib/ids";
import {
  classifyPermissionRisk,
  getRequiredAuthorityForAction,
  type PermissionClassificationInput
} from "@/lib/permissionRisk";
import Account from "@/models/Account";
import AccountMembership from "@/models/AccountMembership";
import DeveloperUser from "@/models/DeveloperUser";
import type { PermissionDocument } from "@/models/Permission";
import type { ApprovalRequestDocument } from "@/models/ApprovalRequest";

export type WorkspaceActor = {
  userId: string;
  accountId: string;
  role: WorkspaceRole;
  authorityLevel: number;
};

export function authorityForbidden(message: string) {
  return jsonError(message, 403);
}

export class MembershipBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipBootstrapError";
  }
}

async function findMembership(userId: string, accountId: string) {
  return AccountMembership.findOne({ userId, accountId }).lean();
}

/**
 * Creates OWNER membership for a user's own primary account only.
 * Uses upsert to avoid duplicate memberships under concurrent requests.
 */
export async function ensureAccountMembership(userId: string, accountId: string) {
  const account = await Account.findOne({ accountId }).lean();
  if (!account) {
    throw new MembershipBootstrapError("Workspace account not found.");
  }

  const user = await DeveloperUser.findOne({ userId }).select("primaryAccountId").lean();
  if (!user?.primaryAccountId) {
    throw new MembershipBootstrapError("No workspace account is associated with this user.");
  }
  if (user.primaryAccountId !== accountId) {
    throw new MembershipBootstrapError("Cannot bootstrap membership for a different workspace account.");
  }

  const membershipId = createPublicId("mbr");
  try {
    return await AccountMembership.findOneAndUpdate(
      { userId, accountId },
      {
        $setOnInsert: {
          membershipId,
          userId,
          accountId,
          role: "OWNER"
        }
      },
      { upsert: true, returnDocument: "after" }
    ).lean();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      const existing = await findMembership(userId, accountId);
      if (existing) return existing;
    }
    throw error;
  }
}

export async function getWorkspaceActor(
  userId: string,
  accountId: string | null | undefined
): Promise<WorkspaceActor | null> {
  if (!accountId) return null;

  const user = await DeveloperUser.findOne({ userId }).select("primaryAccountId").lean();
  if (!user) return null;

  let membership =
    user.primaryAccountId === accountId
      ? await ensureAccountMembership(userId, accountId).catch(() => null)
      : await findMembership(userId, accountId);

  if (!membership) return null;

  const role = isWorkspaceRole(membership.role) ? membership.role : "OWNER";
  return {
    userId,
    accountId,
    role,
    authorityLevel: getAuthorityLevelForRole(role)
  };
}

export function getEffectiveRequiredAuthority(
  permission: Pick<
    PermissionDocument,
    | "action"
    | "resource"
    | "scope"
    | "allowedActions"
    | "blockedActions"
    | "requiresApproval"
    | "template"
    | "constraints"
    | "requiredAuthorityLevel"
  >
): number {
  if (typeof permission.requiredAuthorityLevel === "number") {
    return permission.requiredAuthorityLevel;
  }
  return classifyPermissionRisk({
    action: permission.action,
    resource: permission.resource,
    scope: permission.scope,
    allowedActions: permission.allowedActions,
    blockedActions: permission.blockedActions,
    requiresApproval: permission.requiresApproval ?? undefined,
    template: permission.template ?? undefined,
    constraints: permission.constraints
      ? {
          maxAmount: permission.constraints.maxAmount ?? undefined,
          allowedVendors: permission.constraints.allowedVendors
        }
      : undefined
  }).requiredAuthorityLevel;
}

export function canDelegateRole(actor: WorkspaceActor, targetRole: WorkspaceRole): boolean {
  if (targetRole === "OWNER") {
    return actor.role === "OWNER";
  }
  return actor.authorityLevel > getAuthorityLevelForRole(targetRole);
}

export function canViewMembers(actor: WorkspaceActor): boolean {
  return actor.authorityLevel >= AUTHORITY_LEVELS.ENGINEERING_LEAD || actor.role === "OWNER";
}

export function canManageMembers(actor: WorkspaceActor): boolean {
  return actor.role === "OWNER" || actor.role === "ENGINEERING_LEAD";
}

export function canCreatePermission(actor: WorkspaceActor, permissionInput: PermissionClassificationInput): boolean {
  if (actor.authorityLevel <= AUTHORITY_LEVELS.VIEWER) return false;
  const required = classifyPermissionRisk(permissionInput).requiredAuthorityLevel;
  return actor.authorityLevel >= required;
}

export function canUpdatePermission(
  actor: WorkspaceActor,
  existingPermission: Pick<
    PermissionDocument,
    | "action"
    | "resource"
    | "scope"
    | "allowedActions"
    | "blockedActions"
    | "requiresApproval"
    | "template"
    | "constraints"
    | "requiredAuthorityLevel"
  >,
  nextPermissionInput: PermissionClassificationInput
): boolean {
  if (actor.authorityLevel <= AUTHORITY_LEVELS.VIEWER) return false;
  const existingRequired = getEffectiveRequiredAuthority(existingPermission);
  const nextRequired = classifyPermissionRisk(nextPermissionInput).requiredAuthorityLevel;
  return actor.authorityLevel >= existingRequired && actor.authorityLevel >= nextRequired;
}

export function canRevokePermission(
  actor: WorkspaceActor,
  permission: Pick<
    PermissionDocument,
    | "action"
    | "resource"
    | "scope"
    | "allowedActions"
    | "blockedActions"
    | "requiresApproval"
    | "template"
    | "constraints"
    | "requiredAuthorityLevel"
  >
): boolean {
  if (actor.authorityLevel <= AUTHORITY_LEVELS.VIEWER) return false;
  return actor.authorityLevel >= getEffectiveRequiredAuthority(permission);
}

function resolveApprovalRequiredLevel(
  approvalRequest: Pick<ApprovalRequestDocument, "requiredAuthorityLevel" | "action" | "vendor">
): number {
  return typeof approvalRequest.requiredAuthorityLevel === "number"
    ? approvalRequest.requiredAuthorityLevel
    : getRequiredAuthorityForAction(approvalRequest.action, { vendor: approvalRequest.vendor });
}

export function canApproveRequest(
  actor: WorkspaceActor,
  approvalRequest: Pick<ApprovalRequestDocument, "requiredAuthorityLevel" | "action" | "vendor">
): boolean {
  if (actor.authorityLevel <= AUTHORITY_LEVELS.VIEWER) return false;
  return actor.authorityLevel >= resolveApprovalRequiredLevel(approvalRequest);
}

export function canDenyRequest(
  actor: WorkspaceActor,
  approvalRequest: Pick<
    ApprovalRequestDocument,
    "requiredAuthorityLevel" | "action" | "vendor" | "developerUserId"
  >,
  options?: { isRequesterCancel?: boolean }
): boolean {
  if (actor.authorityLevel <= AUTHORITY_LEVELS.VIEWER) return false;
  if (actor.role === "OWNER") return true;
  if (options?.isRequesterCancel && approvalRequest.developerUserId === actor.userId) {
    return true;
  }
  return actor.authorityLevel >= resolveApprovalRequiredLevel(approvalRequest);
}

export { getRequiredAuthorityForAction };

export function canManageAgents(actor: WorkspaceActor): boolean {
  return actor.authorityLevel > AUTHORITY_LEVELS.VIEWER;
}

export const AGENT_PERMISSION_DENIED_MESSAGE =
  "Agents cannot grant permissions. Create this permission from the dashboard or authenticate with a developer token.";

export function agentCannotGrantPermissions(): ReturnType<typeof authorityForbidden> {
  return authorityForbidden(AGENT_PERMISSION_DENIED_MESSAGE);
}

export function permissionGrantForbidden(): ReturnType<typeof authorityForbidden> {
  return authorityForbidden("You do not have authority to grant this permission.");
}

export function approvalForbidden(): ReturnType<typeof authorityForbidden> {
  return authorityForbidden("This action requires Engineering Lead approval.");
}

export function approvalDenyForbidden(): ReturnType<typeof authorityForbidden> {
  return authorityForbidden("You do not have authority to deny this approval request.");
}

export function roleDelegationForbidden(): ReturnType<typeof authorityForbidden> {
  return authorityForbidden("You cannot assign a role equal to or higher than your own.");
}

export function viewerMutationForbidden(): ReturnType<typeof authorityForbidden> {
  return authorityForbidden("Viewers cannot change workspace resources.");
}

export function serializeWorkspaceAuthority(actor: WorkspaceActor) {
  return {
    role: actor.role,
    roleLabel: getRoleLabel(actor.role),
    authorityLevel: actor.authorityLevel
  };
}

export function enrichApprovalForActor<T extends Record<string, unknown>>(
  approval: T,
  actor: WorkspaceActor
) {
  const requiredAuthorityLevel =
    typeof approval.requiredAuthorityLevel === "number"
      ? approval.requiredAuthorityLevel
      : getRequiredAuthorityForAction(String(approval.action ?? ""), {
          vendor: typeof approval.vendor === "string" ? approval.vendor : null
        });
  const approvalContext = {
    requiredAuthorityLevel,
    action: String(approval.action ?? ""),
    vendor: typeof approval.vendor === "string" ? approval.vendor : undefined,
    developerUserId:
      typeof approval.developerUserId === "string" ? approval.developerUserId : undefined
  };
  const canApprove = canApproveRequest(actor, approvalContext);
  const canDeny = canDenyRequest(actor, approvalContext);
  return {
    ...approval,
    requiredAuthorityLevel,
    requiredRoleLabel: getRequiredRoleLabel(requiredAuthorityLevel),
    canApprove,
    canDeny,
    approveBlockReason: canApprove
      ? null
      : `Requires ${getRequiredRoleLabel(requiredAuthorityLevel)} approval.`,
    denyBlockReason: canDeny
      ? null
      : `Requires ${getRequiredRoleLabel(requiredAuthorityLevel)} authority to deny.`
  };
}
