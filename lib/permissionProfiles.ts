import { classifyPermissionRisk } from "@/lib/permissionRisk";
import {
  canCreatePermission,
  permissionGrantForbidden,
  type WorkspaceActor
} from "@/lib/delegatedAuth";
import { createPublicId } from "@/lib/ids";
import PermissionProfile from "@/models/PermissionProfile";

export type ProfilePermissionInput = {
  action: string;
  resource?: string;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean;
  notes?: string;
};

export function deriveProfileAuthority(permissions: ProfilePermissionInput[]) {
  return permissions.reduce((max, permission) => {
    const level = classifyPermissionRisk({
      action: permission.action,
      resource: permission.resource,
      allowedActions: permission.allowedActions,
      blockedActions: permission.blockedActions,
      requiresApproval: permission.requiresApproval
    }).requiredAuthorityLevel;
    return Math.max(max, level);
  }, 0);
}

export function canManageProfile(actor: WorkspaceActor, requiredAuthorityLevel: number) {
  return actor.authorityLevel >= requiredAuthorityLevel;
}

export async function listPermissionProfiles(accountId: string) {
  return PermissionProfile.find({ accountId, status: "active" })
    .sort({ createdAt: -1 })
    .select("-_id profileId name description permissions requiredAuthorityLevel createdBy createdAt updatedAt")
    .lean();
}

export async function createPermissionProfile(
  actor: WorkspaceActor,
  input: { name: string; description?: string; permissions: ProfilePermissionInput[] }
) {
  const permissions = input.permissions.map((permission) => {
    const requiredAuthorityLevel = classifyPermissionRisk({
      action: permission.action,
      resource: permission.resource,
      allowedActions: permission.allowedActions,
      blockedActions: permission.blockedActions,
      requiresApproval: permission.requiresApproval
    }).requiredAuthorityLevel;
    return { ...permission, requiredAuthorityLevel };
  });

  const requiredAuthorityLevel = deriveProfileAuthority(input.permissions);
  if (!canManageProfile(actor, requiredAuthorityLevel)) {
    return { error: permissionGrantForbidden() };
  }

  const profile = await PermissionProfile.create({
    profileId: createPublicId("pprf"),
    accountId: actor.accountId,
    name: input.name,
    description: input.description,
    permissions,
    requiredAuthorityLevel,
    createdBy: actor.userId,
    status: "active"
  });

  return { profile };
}

export const BUILTIN_PERMISSION_PROFILES: Array<{
  name: string;
  description: string;
  permissions: ProfilePermissionInput[];
}> = [
  {
    name: "Read-only GitHub agent",
    description: "Read issues and comment on pull requests without deploy or secrets access.",
    permissions: [
      { action: "github.issue.read", resource: "github" },
      { action: "github.pr.comment", resource: "github" }
    ]
  },
  {
    name: "Staging deploy agent",
    description: "Deploy to staging and preview environments only.",
    permissions: [
      {
        action: "deploy",
        resource: "staging",
        allowedActions: ["deploy to staging", "create preview deployment"],
        blockedActions: ["deploy to production"]
      }
    ]
  },
  {
    name: "Production deploy agent",
    description: "Production deploy permission. Requires Engineering Lead authority to grant.",
    permissions: [
      {
        action: "deploy_production",
        resource: "production",
        requiresApproval: true
      }
    ]
  },
  {
    name: "Dependency update agent",
    description: "Update dependencies in non-production environments.",
    permissions: [
      {
        action: "dependency.update",
        resource: "staging",
        allowedActions: ["update dependencies", "install packages"]
      }
    ]
  }
];
