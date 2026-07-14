import { classifyPermissionRisk, type PermissionClassificationInput } from "@/lib/permissionRisk";
import {
  canCreatePermission,
  canUpdatePermission,
  permissionGrantForbidden,
  viewerMutationForbidden,
  type WorkspaceActor
} from "@/lib/delegatedAuth";
import { createPublicId } from "@/lib/ids";
import { parsePermissionMetadata } from "@/lib/permissions";
import { jsonError } from "@/lib/responses";
import { isRecord, parseOptionalAmount, parseOptionalDate, readString } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import PermissionProfile from "@/models/PermissionProfile";
import { accountScopeFilter } from "@/lib/accountAccess";

export type PermissionBody = Record<string, unknown>;

export function buildClassificationInput(
  action: string,
  metadata: Awaited<ReturnType<typeof parsePermissionMetadata>>["metadata"],
  constraints: {
    maxAmount?: number;
    allowedVendors?: string[];
    expiresAt?: Date;
    allowedPaths?: string[];
    deniedPaths?: string[];
    deniedCommands?: string[];
  }
): PermissionClassificationInput {
  return {
    action,
    resource: metadata?.resource,
    scope: metadata?.scope,
    allowedActions: metadata?.allowedActions,
    blockedActions: metadata?.blockedActions,
    requiresApproval: metadata?.requiresApproval,
    template: metadata?.template,
    constraints: {
      maxAmount: constraints.maxAmount,
      allowedVendors: constraints.allowedVendors
    }
  };
}

export async function parsePermissionBody(body: PermissionBody) {
  const action = readString(body.action);
  const description = body.description === undefined ? undefined : readString(body.description);
  if (!action) return { error: jsonError("action is required.") };
  if (body.description !== undefined && !description) {
    return { error: jsonError("description must be a non-empty string.") };
  }

  const { metadata, error: metadataError } = parsePermissionMetadata(body);
  if (metadataError || !metadata) {
    return { error: jsonError(metadataError ?? "Invalid permission metadata.") };
  }

  const constraints = body.constraints === undefined ? {} : body.constraints;
  if (!isRecord(constraints)) return { error: jsonError("constraints must be an object.") };

  const { amount: maxAmount, error: amountError } = parseOptionalAmount(constraints.maxAmount);
  if (amountError) return { error: jsonError(amountError) };

  let allowedVendors: string[] | undefined;
  if (constraints.allowedVendors !== undefined) {
    if (
      !Array.isArray(constraints.allowedVendors) ||
      constraints.allowedVendors.some((vendor) => typeof vendor !== "string" || !vendor.trim())
    ) {
      return { error: jsonError("allowedVendors must be an array of non-empty strings.") };
    }
    allowedVendors = constraints.allowedVendors.map((vendor) => vendor.trim());
  }

  const { date: expiresAt, error: dateError } = parseOptionalDate(constraints.expiresAt);
  if (dateError) return { error: jsonError(dateError) };
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return { error: jsonError("expiresAt must be in the future.") };
  }

  let allowedPaths: string[] | undefined;
  if (constraints.allowedPaths !== undefined) {
    if (
      !Array.isArray(constraints.allowedPaths) ||
      constraints.allowedPaths.some((p) => typeof p !== "string" || !p.trim())
    ) {
      return { error: jsonError("allowedPaths must be an array of non-empty strings.") };
    }
    allowedPaths = constraints.allowedPaths.map((p: string) => p.trim());
  }

  let deniedPaths: string[] | undefined;
  if (constraints.deniedPaths !== undefined) {
    if (
      !Array.isArray(constraints.deniedPaths) ||
      constraints.deniedPaths.some((p) => typeof p !== "string" || !p.trim())
    ) {
      return { error: jsonError("deniedPaths must be an array of non-empty strings.") };
    }
    deniedPaths = constraints.deniedPaths.map((p: string) => p.trim());
  }

  let deniedCommands: string[] | undefined;
  if (constraints.deniedCommands !== undefined) {
    if (
      !Array.isArray(constraints.deniedCommands) ||
      constraints.deniedCommands.some((c) => typeof c !== "string" || !c.trim())
    ) {
      return { error: jsonError("deniedCommands must be an array of non-empty strings.") };
    }
    deniedCommands = constraints.deniedCommands.map((c: string) => c.trim());
  }

  const parsedConstraints = {
    maxAmount,
    allowedVendors,
    expiresAt,
    allowedPaths,
    deniedPaths,
    deniedCommands
  };

  const classificationInput = buildClassificationInput(action, metadata, parsedConstraints);
  return {
    action,
    description,
    metadata,
    constraints: parsedConstraints,
    classificationInput
  };
}

export async function createPermissionForAgent(options: {
  actor: WorkspaceActor;
  userId: string;
  agentId: string;
  body: PermissionBody;
}) {
  if (options.actor.authorityLevel <= 10) {
    return { error: viewerMutationForbidden() };
  }

  const agent = await Agent.findOne({
    ...accountScopeFilter(options.actor.accountId),
    agentId: options.agentId
  });
  if (!agent) return { error: jsonError("Agent not found.", 404) };

  const parsed = await parsePermissionBody(options.body);
  if ("error" in parsed && parsed.error) return { error: parsed.error };
  if (!parsed.classificationInput || !parsed.action || !parsed.metadata) {
    return { error: jsonError("Invalid permission payload.") };
  }

  if (!canCreatePermission(options.actor, parsed.classificationInput)) {
    return { error: permissionGrantForbidden() };
  }

  const { requiredAuthorityLevel } = classifyPermissionRisk(parsed.classificationInput);
  const permissionId = createPublicId("perm");

  await Permission.create({
    permissionId,
    accountId: options.actor.accountId,
    developerUserId: options.userId,
    createdBy: options.userId,
    agentId: options.agentId,
    action: parsed.action,
    description: parsed.description,
    ...parsed.metadata,
    requiredAuthorityLevel,
    constraints: parsed.constraints,
    status: "active"
  });

  await emitWebhookEvent(
    createWebhookEvent(options.actor.accountId, "permission.created", {
      permissionId,
      agentId: options.agentId,
      action: parsed.action
    }, options.userId)
  );

  return { permissionId, status: "active", requiredAuthorityLevel };
}

/**
 * Replaces an active permission without claiming cross-document transaction
 * support from the current Mongo topology. The old permission is conditionally
 * retired first, so there is never a duplicate-active window. If creation of
 * the replacement fails, the old permission is explicitly reactivated.
 */
export async function replacePermissionForAgent(options: {
  actor: WorkspaceActor;
  userId: string;
  agentId: string;
  permissionId: string;
  body: PermissionBody;
}) {
  if (options.actor.authorityLevel <= 10) {
    return { error: viewerMutationForbidden() };
  }

  const existing = await Permission.findOne({
    ...accountScopeFilter(options.actor.accountId),
    agentId: options.agentId,
    permissionId: options.permissionId
  });
  if (!existing) return { error: jsonError("Permission not found.", 404) };
  if (existing.status !== "active") {
    return { error: jsonError("Only active permissions can be replaced.", 409) };
  }

  const parsed = await parsePermissionBody(options.body);
  if ("error" in parsed && parsed.error) return { error: parsed.error };
  if (!parsed.classificationInput || !parsed.action || !parsed.metadata) {
    return { error: jsonError("Invalid permission payload.") };
  }
  if (!canUpdatePermission(options.actor, existing, parsed.classificationInput)) {
    return { error: permissionGrantForbidden() };
  }

  const { requiredAuthorityLevel } = classifyPermissionRisk(parsed.classificationInput);
  const replacementPermissionId = createPublicId("perm");
  const existingUpdatedBy = existing.updatedBy;
  const overlapCandidates = await Permission.find({
    ...accountScopeFilter(options.actor.accountId),
    agentId: options.agentId,
    action: parsed.action,
    status: "active",
    permissionId: { $ne: options.permissionId }
  })
    .select("-_id permissionId resource")
    .lean<Array<{ permissionId: string; resource?: string | null }>>();
  const targetResource = parsed.metadata.resource?.trim().toLowerCase() ?? "";
  const overlapPermissionIds = overlapCandidates
    .filter((permission) => (permission.resource?.trim().toLowerCase() ?? "") === targetResource)
    .map((permission) => permission.permissionId);

  const retired = await Permission.findOneAndUpdate(
    {
      ...accountScopeFilter(options.actor.accountId),
      agentId: options.agentId,
      permissionId: options.permissionId,
      status: "active"
    },
    {
      $set: {
        status: "revoked",
        updatedBy: options.userId,
        replacedByPermissionId: replacementPermissionId
      }
    },
    { returnDocument: "after" }
  );
  if (!retired) {
    return { error: jsonError("Permission changed before it could be replaced. Refresh and try again.", 409) };
  }

  try {
    await Permission.create({
      permissionId: replacementPermissionId,
      accountId: options.actor.accountId,
      developerUserId: options.userId,
      createdBy: options.userId,
      agentId: options.agentId,
      action: parsed.action,
      description: parsed.description,
      ...parsed.metadata,
      requiredAuthorityLevel,
      constraints: parsed.constraints,
      replacesPermissionId: options.permissionId,
      status: "active"
    });
  } catch {
    try {
      await Permission.updateOne(
        {
          ...accountScopeFilter(options.actor.accountId),
          agentId: options.agentId,
          permissionId: options.permissionId,
          status: "revoked",
          replacedByPermissionId: replacementPermissionId
        },
        {
          $set: {
            status: "active",
            ...(existingUpdatedBy ? { updatedBy: existingUpdatedBy } : {})
          },
          $unset: {
            replacedByPermissionId: "",
            ...(!existingUpdatedBy ? { updatedBy: "" } : {})
          }
        }
      );
    } catch {
      return {
        error: jsonError(
          "Replacement creation failed and the original permission could not be restored. No duplicate active permission was created.",
          500
        )
      };
    }
    return {
      error: jsonError("Replacement creation failed. The original permission was restored and remains active.", 500)
    };
  }

  await Promise.allSettled([
    emitWebhookEvent(
      createWebhookEvent(options.actor.accountId, "permission.revoked", {
        permissionId: options.permissionId,
        agentId: options.agentId,
        action: existing.action,
        replacedByPermissionId: replacementPermissionId
      }, options.userId)
    ),
    emitWebhookEvent(
      createWebhookEvent(options.actor.accountId, "permission.created", {
        permissionId: replacementPermissionId,
        agentId: options.agentId,
        action: parsed.action,
        replacesPermissionId: options.permissionId
      }, options.userId)
    )
  ]);

  return {
    retiredPermissionId: options.permissionId,
    retiredStatus: "revoked" as const,
    permissionId: replacementPermissionId,
    status: "active" as const,
    requiredAuthorityLevel,
    overlapPermissionIds
  };
}

export async function applyPermissionProfile(options: {
  actor: WorkspaceActor;
  userId: string;
  agentId: string;
  profileId: string;
}) {
  const profile = await PermissionProfile.findOne({
    profileId: options.profileId,
    accountId: options.actor.accountId,
    status: "active"
  }).lean();
  if (!profile) return { error: jsonError("Permission profile not found.", 404) };

  if (options.actor.authorityLevel < profile.requiredAuthorityLevel) {
    return { error: permissionGrantForbidden() };
  }

  const created: string[] = [];
  for (const permission of profile.permissions) {
    const result = await createPermissionForAgent({
      actor: options.actor,
      userId: options.userId,
      agentId: options.agentId,
      body: {
        action: permission.action,
        resource: permission.resource,
        allowedActions: permission.allowedActions,
        blockedActions: permission.blockedActions,
        requiresApproval: permission.requiresApproval,
        notes: permission.notes
      }
    });
    if ("error" in result && result.error) return { error: result.error };
    if ("permissionId" in result && result.permissionId) created.push(result.permissionId);
  }

  return { permissionIds: created, profileId: profile.profileId };
}
