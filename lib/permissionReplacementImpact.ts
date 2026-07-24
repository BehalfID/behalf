import { getRequiredRoleLabel } from "@/lib/authority";
import { classifyPermissionRisk, type PermissionClassificationInput } from "@/lib/permissionRisk";
import type { PermissionDocument } from "@/models/Permission";

export type PermissionImpactSnapshot = {
  action: string;
  resource?: string | null;
  requiresApproval?: boolean | null;
  requiredAuthorityLevel: number;
  allowedActions?: string[] | null;
  blockedActions?: string[] | null;
  constraints?: {
    maxAmount?: number | null;
    allowedVendors?: string[] | null;
    expiresAt?: Date | string | null;
    allowedPaths?: string[] | null;
    deniedPaths?: string[] | null;
    deniedCommands?: string[] | null;
  } | null;
};

export type PermissionImpactSource = {
  action: string;
  resource?: string | null;
  requiresApproval?: boolean | null;
  requiredAuthorityLevel?: number | null;
  allowedActions?: string[] | null;
  blockedActions?: string[] | null;
  constraints?: PermissionImpactSnapshot["constraints"];
  scope?: string | null;
  template?: string | null;
};

function normalizeList(values?: string[] | null) {
  return [...(values ?? [])].map((value) => value.trim().toLowerCase()).filter(Boolean).sort();
}

function listExpanded(before?: string[] | null, after?: string[] | null) {
  const beforeSet = new Set(normalizeList(before));
  return normalizeList(after).some((value) => !beforeSet.has(value));
}

function listReduced(before?: string[] | null, after?: string[] | null) {
  const afterSet = new Set(normalizeList(after));
  return normalizeList(before).some((value) => !afterSet.has(value));
}

function constraintLoosened(
  before: PermissionImpactSnapshot["constraints"],
  after: PermissionImpactSnapshot["constraints"]
) {
  const beforeMax = before?.maxAmount;
  const afterMax = after?.maxAmount;
  if (typeof beforeMax === "number" && (afterMax == null || afterMax > beforeMax)) return true;
  if (before?.expiresAt && !after?.expiresAt) return true;
  if (listReduced(before?.allowedVendors, after?.allowedVendors) && (after?.allowedVendors?.length ?? 0) === 0) {
    return true;
  }
  if (listExpanded(before?.allowedVendors, after?.allowedVendors) && (before?.allowedVendors?.length ?? 0) > 0) {
    return true;
  }
  if (listReduced(before?.deniedCommands, after?.deniedCommands)) return true;
  if (listReduced(before?.deniedPaths, after?.deniedPaths)) return true;
  if (listExpanded(before?.allowedPaths, after?.allowedPaths) && (before?.allowedPaths?.length ?? 0) > 0) {
    return true;
  }
  if ((before?.allowedPaths?.length ?? 0) > 0 && (after?.allowedPaths?.length ?? 0) === 0) return true;
  return false;
}

function constraintTightened(
  before: PermissionImpactSnapshot["constraints"],
  after: PermissionImpactSnapshot["constraints"]
) {
  const beforeMax = before?.maxAmount;
  const afterMax = after?.maxAmount;
  if (typeof afterMax === "number" && (beforeMax == null || afterMax < beforeMax)) return true;
  if (!before?.expiresAt && after?.expiresAt) return true;
  if (listExpanded(before?.deniedCommands, after?.deniedCommands)) return true;
  if (listExpanded(before?.deniedPaths, after?.deniedPaths)) return true;
  if (listReduced(before?.allowedPaths, after?.allowedPaths)) return true;
  if ((before?.allowedVendors?.length ?? 0) === 0 && (after?.allowedVendors?.length ?? 0) > 0) return true;
  return false;
}

export function assessPermissionReplacementImpact(
  before: PermissionImpactSnapshot,
  afterInput: PermissionClassificationInput
) {
  const afterRisk = classifyPermissionRisk(afterInput);
  const after: PermissionImpactSnapshot = {
    action: afterInput.action,
    resource: afterInput.resource,
    requiresApproval: afterInput.requiresApproval,
    requiredAuthorityLevel: afterRisk.requiredAuthorityLevel,
    allowedActions: afterInput.allowedActions,
    blockedActions: afterInput.blockedActions,
    constraints: afterInput.constraints
      ? {
          maxAmount: afterInput.constraints.maxAmount,
          allowedVendors: afterInput.constraints.allowedVendors
        }
      : before.constraints
  };

  const authorityExpanded = after.requiredAuthorityLevel > before.requiredAuthorityLevel;
  const authorityReduced = after.requiredAuthorityLevel < before.requiredAuthorityLevel;
  const approvalRemoved = before.requiresApproval === true && after.requiresApproval !== true;
  const approvalAdded = before.requiresApproval !== true && after.requiresApproval === true;
  const resourceBroadened =
    Boolean(before.resource?.trim()) && !(after.resource ?? "").trim();
  const allowedExpanded = listExpanded(before.allowedActions, after.allowedActions);
  const blockedReduced = listReduced(before.blockedActions, after.blockedActions);
  const expandsAccess =
    authorityExpanded ||
    approvalRemoved ||
    resourceBroadened ||
    allowedExpanded ||
    blockedReduced ||
    constraintLoosened(before.constraints, after.constraints);
  const reducesAccess =
    authorityReduced ||
    approvalAdded ||
    listReduced(before.allowedActions, after.allowedActions) ||
    listExpanded(before.blockedActions, after.blockedActions) ||
    constraintTightened(before.constraints, after.constraints);

  const changes: string[] = [];
  if (before.action !== after.action) {
    changes.push(`Action changes from ${before.action} to ${after.action}.`);
  }
  if ((before.resource ?? "") !== (after.resource ?? "")) {
    changes.push(
      `Resource changes from ${before.resource?.trim() || "any"} to ${after.resource?.trim() || "any"}.`
    );
  }
  if (authorityExpanded || authorityReduced) {
    changes.push(
      `Required authority moves from ${getRequiredRoleLabel(before.requiredAuthorityLevel)} (level ${before.requiredAuthorityLevel}) to ${getRequiredRoleLabel(after.requiredAuthorityLevel)} (level ${after.requiredAuthorityLevel}).`
    );
  }
  if (approvalAdded) changes.push("An approval gate is added.");
  if (approvalRemoved) changes.push("The approval gate is removed.");
  if (expandsAccess) changes.push("Overall access expands relative to the current record.");
  if (reducesAccess) changes.push("Overall access is reduced relative to the current record.");
  if (!changes.length) changes.push("Policy fields change without a clear expansion or reduction.");

  return {
    expandsAccess,
    reducesAccess,
    authorityExpanded,
    authorityReduced,
    approvalAdded,
    approvalRemoved,
    requiredAuthorityLevel: after.requiredAuthorityLevel,
    changes
  };
}

export function permissionDocumentImpactSnapshot(
  permission: PermissionImpactSource
): PermissionImpactSnapshot {
  return {
    action: permission.action,
    resource: permission.resource,
    requiresApproval: permission.requiresApproval,
    requiredAuthorityLevel:
      typeof permission.requiredAuthorityLevel === "number"
        ? permission.requiredAuthorityLevel
        : classifyPermissionRisk({
            action: permission.action,
            resource: permission.resource ?? undefined,
            scope: permission.scope ?? undefined,
            allowedActions: permission.allowedActions ?? undefined,
            blockedActions: permission.blockedActions ?? undefined,
            requiresApproval: permission.requiresApproval ?? undefined,
            template: permission.template ?? undefined,
            constraints: permission.constraints
              ? {
                  maxAmount: permission.constraints.maxAmount ?? undefined,
                  allowedVendors: permission.constraints.allowedVendors ?? undefined
                }
              : undefined
          }).requiredAuthorityLevel,
    allowedActions: permission.allowedActions,
    blockedActions: permission.blockedActions,
    constraints: permission.constraints
  };
}
