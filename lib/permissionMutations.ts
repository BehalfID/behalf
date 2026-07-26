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
import {
  assessPermissionReplacementImpact,
  permissionDocumentImpactSnapshot
} from "@/lib/permissionReplacementImpact";
import {
  abandonStagedReplacementPermission,
  activateStagedReplacementPermission,
  findReplacementByIdempotencyKey,
  revokeActivePermissionForReplacement,
  stageReplacementPermission
} from "@/lib/repositories/permissions";
import { jsonError } from "@/lib/responses";
import { isRecord, parseOptionalAmount, parseOptionalDate, readString } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import PermissionProfile from "@/models/PermissionProfile";
import PermissionReplacementAudit from "@/models/PermissionReplacementAudit";
import { accountScopeFilter } from "@/lib/accountAccess";

export type PermissionBody = Record<string, unknown>;

type ReplacementAuditType = "attempted" | "rejected" | "completed" | "interrupted";

async function recordPermissionReplacementAudit(input: {
  accountId: string;
  agentId: string;
  actorUserId: string;
  type: ReplacementAuditType;
  oldPermissionId: string;
  replacementPermissionId?: string;
  idempotencyKey?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await PermissionReplacementAudit.create({
      eventId: createPublicId("pra"),
      accountId: input.accountId,
      agentId: input.agentId,
      actorUserId: input.actorUserId,
      type: input.type,
      oldPermissionId: input.oldPermissionId,
      replacementPermissionId: input.replacementPermissionId,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      metadata: {
        oldPermissionId: input.oldPermissionId,
        replacementPermissionId: input.replacementPermissionId,
        ...input.metadata
      }
    });
  } catch {
    // Audit must not block fail-closed replacement control flow.
  }
}

function parseExpectedUpdatedAt(value: unknown): { date?: Date; error?: ReturnType<typeof jsonError> } {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string" && !(value instanceof Date)) {
    return { error: jsonError("expectedUpdatedAt must be an ISO timestamp.") };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: jsonError("expectedUpdatedAt must be a valid ISO timestamp.") };
  }
  return { date };
}

function parseIdempotencyKey(value: unknown): { key?: string; error?: ReturnType<typeof jsonError> } {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    return { error: jsonError("idempotencyKey must be a non-empty string up to 120 characters.") };
  }
  return { key: value.trim() };
}

function replacementSuccess(result: {
  retiredPermissionId: string;
  permissionId: string;
  requiredAuthorityLevel: number;
  idempotencyKey: string;
  resumed?: boolean;
  impact: ReturnType<typeof assessPermissionReplacementImpact>;
}) {
  return {
    retiredPermissionId: result.retiredPermissionId,
    retiredStatus: "revoked" as const,
    permissionId: result.permissionId,
    status: "active" as const,
    requiredAuthorityLevel: result.requiredAuthorityLevel,
    idempotencyKey: result.idempotencyKey,
    resumed: Boolean(result.resumed),
    impact: result.impact
  };
}

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
    allowedBranches?: string[];
    deniedBranches?: string[];
    allowedEnvironments?: string[];
    deniedEnvironments?: string[];
    allowedRepositories?: string[];
    deniedRepositories?: string[];
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

  function parseStringList(field: string, value: unknown): { values?: string[]; error?: ReturnType<typeof jsonError> } {
    if (value === undefined) return {};
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
      return { error: jsonError(`${field} must be an array of non-empty strings.`) };
    }
    return { values: value.map((item: string) => item.trim()) };
  }

  const allowedBranches = parseStringList("allowedBranches", constraints.allowedBranches);
  if (allowedBranches.error) return { error: allowedBranches.error };
  const deniedBranches = parseStringList("deniedBranches", constraints.deniedBranches);
  if (deniedBranches.error) return { error: deniedBranches.error };
  const allowedEnvironments = parseStringList("allowedEnvironments", constraints.allowedEnvironments);
  if (allowedEnvironments.error) return { error: allowedEnvironments.error };
  const deniedEnvironments = parseStringList("deniedEnvironments", constraints.deniedEnvironments);
  if (deniedEnvironments.error) return { error: deniedEnvironments.error };
  const allowedRepositories = parseStringList("allowedRepositories", constraints.allowedRepositories);
  if (allowedRepositories.error) return { error: allowedRepositories.error };
  const deniedRepositories = parseStringList("deniedRepositories", constraints.deniedRepositories);
  if (deniedRepositories.error) return { error: deniedRepositories.error };

  const parsedConstraints = {
    maxAmount,
    allowedVendors,
    expiresAt,
    allowedPaths,
    deniedPaths,
    deniedCommands,
    allowedBranches: allowedBranches.values,
    deniedBranches: deniedBranches.values,
    allowedEnvironments: allowedEnvironments.values,
    deniedEnvironments: deniedEnvironments.values,
    allowedRepositories: allowedRepositories.values,
    deniedRepositories: deniedRepositories.values
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
 * Fail-closed permission replacement without Mongo multi-document transactions:
 * 1) stage replacement inactive
 * 2) conditionally revoke the old active permission
 * 3) activate the staged replacement
 * 4) if activation fails, leave access denied and allow idempotent retry
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

  const expectedUpdatedAt = parseExpectedUpdatedAt(options.body.expectedUpdatedAt);
  if (expectedUpdatedAt.error) return { error: expectedUpdatedAt.error };
  const idempotencyParsed = parseIdempotencyKey(options.body.idempotencyKey);
  if (idempotencyParsed.error) return { error: idempotencyParsed.error };
  const idempotencyKey = idempotencyParsed.key ?? createPublicId("prk");

  const agent = await Agent.findOne({
    ...accountScopeFilter(options.actor.accountId),
    agentId: options.agentId
  });
  if (!agent) return { error: jsonError("Agent not found.", 404) };

  const existing = await Permission.findOne({
    ...accountScopeFilter(options.actor.accountId),
    agentId: options.agentId,
    permissionId: options.permissionId
  });
  if (!existing) return { error: jsonError("Permission not found.", 404) };
  if (existing.accountId && existing.accountId !== options.actor.accountId) {
    return { error: jsonError("Permission not found.", 404) };
  }
  if (existing.agentId !== options.agentId) {
    return { error: jsonError("Permission not found.", 404) };
  }

  const parsed = await parsePermissionBody(options.body);
  if ("error" in parsed && parsed.error) return { error: parsed.error };
  if (!parsed.classificationInput || !parsed.action || !parsed.metadata) {
    return { error: jsonError("Invalid permission payload.") };
  }

  const impact = assessPermissionReplacementImpact(
    permissionDocumentImpactSnapshot(existing),
    parsed.classificationInput
  );

  await recordPermissionReplacementAudit({
    accountId: options.actor.accountId,
    agentId: options.agentId,
    actorUserId: options.userId,
    type: "attempted",
    oldPermissionId: options.permissionId,
    idempotencyKey,
    metadata: {
      expectedUpdatedAt: expectedUpdatedAt.date?.toISOString(),
      expandsAccess: impact.expandsAccess,
      reducesAccess: impact.reducesAccess
    }
  });

  if (!canUpdatePermission(options.actor, existing, parsed.classificationInput)) {
    await recordPermissionReplacementAudit({
      accountId: options.actor.accountId,
      agentId: options.agentId,
      actorUserId: options.userId,
      type: "rejected",
      oldPermissionId: options.permissionId,
      idempotencyKey,
      reason: "insufficient_authority"
    });
    return { error: permissionGrantForbidden() };
  }

  const priorReplacement = await findReplacementByIdempotencyKey(
    options.actor.accountId,
    idempotencyKey
  );

  if (priorReplacement) {
    if (priorReplacement.agentId !== options.agentId) {
      await recordPermissionReplacementAudit({
        accountId: options.actor.accountId,
        agentId: options.agentId,
        actorUserId: options.userId,
        type: "rejected",
        oldPermissionId: options.permissionId,
        replacementPermissionId: priorReplacement.permissionId,
        idempotencyKey,
        reason: "idempotency_key_conflict"
      });
      return {
        error: jsonError("idempotencyKey is already used by another permission replacement.", 409, {
          code: "PERMISSION_REPLACEMENT_IDEMPOTENCY_CONFLICT",
          replacementPermissionId: priorReplacement.permissionId
        })
      };
    }

    if (
      priorReplacement.status === "active" &&
      priorReplacement.replacesPermissionId === options.permissionId
    ) {
      await recordPermissionReplacementAudit({
        accountId: options.actor.accountId,
        agentId: options.agentId,
        actorUserId: options.userId,
        type: "completed",
        oldPermissionId: options.permissionId,
        replacementPermissionId: priorReplacement.permissionId,
        idempotencyKey,
        reason: "idempotent_replay",
        metadata: { resumed: false, replay: true }
      });
      return replacementSuccess({
        retiredPermissionId: options.permissionId,
        permissionId: priorReplacement.permissionId,
        requiredAuthorityLevel:
          priorReplacement.requiredAuthorityLevel ??
          classifyPermissionRisk(parsed.classificationInput).requiredAuthorityLevel,
        idempotencyKey,
        resumed: false,
        impact
      });
    }

    if (
      priorReplacement.status === "inactive" &&
      priorReplacement.replacesPermissionId === options.permissionId
    ) {
      const activated = await activateStagedReplacementPermission({
        permissionId: priorReplacement.permissionId,
        accountId: options.actor.accountId,
        agentId: options.agentId,
        updatedBy: options.userId,
        replacesPermissionId: options.permissionId
      });
      if (!activated) {
        await recordPermissionReplacementAudit({
          accountId: options.actor.accountId,
          agentId: options.agentId,
          actorUserId: options.userId,
          type: "interrupted",
          oldPermissionId: options.permissionId,
          replacementPermissionId: priorReplacement.permissionId,
          idempotencyKey,
          reason: "activation_failed_on_resume"
        });
        return {
          error: jsonError(
            "Replacement was interrupted after the original permission was revoked. Access remains denied. Retry with the same idempotencyKey to finish activation.",
            409,
            {
              code: "PERMISSION_REPLACEMENT_INTERRUPTED",
              retiredPermissionId: options.permissionId,
              replacementPermissionId: priorReplacement.permissionId,
              idempotencyKey
            }
          )
        };
      }

      await recordPermissionReplacementAudit({
        accountId: options.actor.accountId,
        agentId: options.agentId,
        actorUserId: options.userId,
        type: "completed",
        oldPermissionId: options.permissionId,
        replacementPermissionId: priorReplacement.permissionId,
        idempotencyKey,
        reason: "resumed_activation",
        metadata: { resumed: true }
      });

      await Promise.allSettled([
        emitWebhookEvent(
          createWebhookEvent(
            options.actor.accountId,
            "permission.revoked",
            {
              permissionId: options.permissionId,
              agentId: options.agentId,
              action: existing.action,
              replacedByPermissionId: priorReplacement.permissionId
            },
            options.userId
          )
        ),
        emitWebhookEvent(
          createWebhookEvent(
            options.actor.accountId,
            "permission.created",
            {
              permissionId: priorReplacement.permissionId,
              agentId: options.agentId,
              action: parsed.action,
              replacesPermissionId: options.permissionId
            },
            options.userId
          )
        )
      ]);

      return replacementSuccess({
        retiredPermissionId: options.permissionId,
        permissionId: priorReplacement.permissionId,
        requiredAuthorityLevel:
          activated.requiredAuthorityLevel ??
          classifyPermissionRisk(parsed.classificationInput).requiredAuthorityLevel,
        idempotencyKey,
        resumed: true,
        impact
      });
    }

    await recordPermissionReplacementAudit({
      accountId: options.actor.accountId,
      agentId: options.agentId,
      actorUserId: options.userId,
      type: "rejected",
      oldPermissionId: options.permissionId,
      replacementPermissionId: priorReplacement.permissionId,
      idempotencyKey,
      reason: "idempotency_key_unusable_state"
    });
    return {
      error: jsonError("idempotencyKey refers to a replacement that cannot be resumed.", 409, {
        code: "PERMISSION_REPLACEMENT_IDEMPOTENCY_CONFLICT",
        replacementPermissionId: priorReplacement.permissionId
      })
    };
  }

  if (existing.status === "inactive") {
    await recordPermissionReplacementAudit({
      accountId: options.actor.accountId,
      agentId: options.agentId,
      actorUserId: options.userId,
      type: "rejected",
      oldPermissionId: options.permissionId,
      idempotencyKey,
      reason: "target_inactive"
    });
    return { error: jsonError("Only active permissions can be replaced.", 409) };
  }

  if (existing.status !== "active") {
    const stagedSuccessor =
      existing.replacedByPermissionId
        ? await Permission.findOne({
            ...accountScopeFilter(options.actor.accountId),
            agentId: options.agentId,
            permissionId: existing.replacedByPermissionId,
            replacesPermissionId: options.permissionId
          })
        : null;

    if (stagedSuccessor?.status === "inactive") {
      const activated = await activateStagedReplacementPermission({
        permissionId: stagedSuccessor.permissionId,
        accountId: options.actor.accountId,
        agentId: options.agentId,
        updatedBy: options.userId,
        replacesPermissionId: options.permissionId
      });
      if (!activated) {
        await recordPermissionReplacementAudit({
          accountId: options.actor.accountId,
          agentId: options.agentId,
          actorUserId: options.userId,
          type: "interrupted",
          oldPermissionId: options.permissionId,
          replacementPermissionId: stagedSuccessor.permissionId,
          idempotencyKey: stagedSuccessor.replacementIdempotencyKey ?? idempotencyKey,
          reason: "activation_failed_after_revoke"
        });
        return {
          error: jsonError(
            "Replacement was interrupted after the original permission was revoked. Access remains denied. Retry to finish activation.",
            409,
            {
              code: "PERMISSION_REPLACEMENT_INTERRUPTED",
              retiredPermissionId: options.permissionId,
              replacementPermissionId: stagedSuccessor.permissionId,
              idempotencyKey: stagedSuccessor.replacementIdempotencyKey ?? idempotencyKey
            }
          )
        };
      }

      await recordPermissionReplacementAudit({
        accountId: options.actor.accountId,
        agentId: options.agentId,
        actorUserId: options.userId,
        type: "completed",
        oldPermissionId: options.permissionId,
        replacementPermissionId: stagedSuccessor.permissionId,
        idempotencyKey: stagedSuccessor.replacementIdempotencyKey ?? idempotencyKey,
        reason: "recovered_interrupted_replacement",
        metadata: { resumed: true }
      });

      return replacementSuccess({
        retiredPermissionId: options.permissionId,
        permissionId: stagedSuccessor.permissionId,
        requiredAuthorityLevel:
          activated.requiredAuthorityLevel ??
          classifyPermissionRisk(parsed.classificationInput).requiredAuthorityLevel,
        idempotencyKey: stagedSuccessor.replacementIdempotencyKey ?? idempotencyKey,
        resumed: true,
        impact
      });
    }

    if (stagedSuccessor?.status === "active") {
      return replacementSuccess({
        retiredPermissionId: options.permissionId,
        permissionId: stagedSuccessor.permissionId,
        requiredAuthorityLevel:
          stagedSuccessor.requiredAuthorityLevel ??
          classifyPermissionRisk(parsed.classificationInput).requiredAuthorityLevel,
        idempotencyKey: stagedSuccessor.replacementIdempotencyKey ?? idempotencyKey,
        resumed: false,
        impact
      });
    }

    await recordPermissionReplacementAudit({
      accountId: options.actor.accountId,
      agentId: options.agentId,
      actorUserId: options.userId,
      type: "rejected",
      oldPermissionId: options.permissionId,
      idempotencyKey,
      reason: "target_not_active"
    });
    return { error: jsonError("Only active permissions can be replaced.", 409) };
  }

  const { requiredAuthorityLevel } = classifyPermissionRisk(parsed.classificationInput);
  const replacementPermissionId = createPublicId("perm");

  try {
    await stageReplacementPermission({
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
      replacementIdempotencyKey: idempotencyKey,
      status: "inactive"
    });
  } catch (error) {
    await recordPermissionReplacementAudit({
      accountId: options.actor.accountId,
      agentId: options.agentId,
      actorUserId: options.userId,
      type: "rejected",
      oldPermissionId: options.permissionId,
      replacementPermissionId,
      idempotencyKey,
      reason: "stage_failed",
      metadata: {
        error: error instanceof Error ? error.message : "unknown"
      }
    });
    return { error: jsonError("Could not stage the replacement permission.", 500) };
  }

  const retired = await revokeActivePermissionForReplacement({
    permissionId: options.permissionId,
    accountId: options.actor.accountId,
    agentId: options.agentId,
    replacementPermissionId,
    updatedBy: options.userId,
    expectedUpdatedAt: expectedUpdatedAt.date
  });

  if (!retired) {
    await abandonStagedReplacementPermission({
      permissionId: replacementPermissionId,
      accountId: options.actor.accountId,
      agentId: options.agentId,
      updatedBy: options.userId
    });
    await recordPermissionReplacementAudit({
      accountId: options.actor.accountId,
      agentId: options.agentId,
      actorUserId: options.userId,
      type: "rejected",
      oldPermissionId: options.permissionId,
      replacementPermissionId,
      idempotencyKey,
      reason: "stale_or_concurrent_conflict"
    });
    return {
      error: jsonError(
        "Permission changed before it could be replaced. Refresh and try again.",
        409,
        {
          code: "PERMISSION_REPLACEMENT_CONFLICT",
          permissionId: options.permissionId
        }
      )
    };
  }

  const activated = await activateStagedReplacementPermission({
    permissionId: replacementPermissionId,
    accountId: options.actor.accountId,
    agentId: options.agentId,
    updatedBy: options.userId,
    replacesPermissionId: options.permissionId
  });

  if (!activated) {
    await recordPermissionReplacementAudit({
      accountId: options.actor.accountId,
      agentId: options.agentId,
      actorUserId: options.userId,
      type: "interrupted",
      oldPermissionId: options.permissionId,
      replacementPermissionId,
      idempotencyKey,
      reason: "activation_failed_after_revoke",
      metadata: {
        failClosed: true,
        retiredPermissionId: options.permissionId,
        replacementPermissionId
      }
    });
    return {
      error: jsonError(
        "Replacement was interrupted after the original permission was revoked. Access remains denied. Retry with the same idempotencyKey to finish activation.",
        409,
        {
          code: "PERMISSION_REPLACEMENT_INTERRUPTED",
          retiredPermissionId: options.permissionId,
          replacementPermissionId,
          idempotencyKey
        }
      )
    };
  }

  await recordPermissionReplacementAudit({
    accountId: options.actor.accountId,
    agentId: options.agentId,
    actorUserId: options.userId,
    type: "completed",
    oldPermissionId: options.permissionId,
    replacementPermissionId,
    idempotencyKey,
    metadata: {
      expandsAccess: impact.expandsAccess,
      reducesAccess: impact.reducesAccess,
      oldPermissionId: options.permissionId,
      replacementPermissionId
    }
  });

  await Promise.allSettled([
    emitWebhookEvent(
      createWebhookEvent(
        options.actor.accountId,
        "permission.revoked",
        {
          permissionId: options.permissionId,
          agentId: options.agentId,
          action: existing.action,
          replacedByPermissionId: replacementPermissionId
        },
        options.userId
      )
    ),
    emitWebhookEvent(
      createWebhookEvent(
        options.actor.accountId,
        "permission.created",
        {
          permissionId: replacementPermissionId,
          agentId: options.agentId,
          action: parsed.action,
          replacesPermissionId: options.permissionId
        },
        options.userId
      )
    )
  ]);

  return replacementSuccess({
    retiredPermissionId: options.permissionId,
    permissionId: replacementPermissionId,
    requiredAuthorityLevel,
    idempotencyKey,
    impact
  });
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
