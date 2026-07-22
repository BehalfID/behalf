import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import AdaptiveDelegationEvent from "@/models/AdaptiveDelegationEvent";
import AdaptiveDelegationRecommendation from "@/models/AdaptiveDelegationRecommendation";
import { applyPermissionProfile, createPermissionForAgent } from "@/lib/permissionMutations";
import { createPermissionProfile } from "@/lib/permissionProfiles";
import { createPublicId } from "@/lib/ids";
import { jsonError } from "@/lib/responses";
import type { WorkspaceActor } from "@/lib/delegatedAuth";
import {
  AdaptiveDelegationEngine,
  autoAllowKey,
  trustProfileKey
} from "@/lib/adaptiveDelegation/engine";
import { loadApprovalPatterns, loadContextPatterns } from "@/lib/adaptiveDelegation/history";
import { getTrustProfileTemplate, toProfilePermissionInputs } from "@/lib/adaptiveDelegation/trustProfiles";
import {
  getOrgDelegationTemplate,
  toOrgProfilePermissionInputs
} from "@/lib/adaptiveDelegation/orgTemplates";
import { AUTHORITY_LEVELS } from "@/lib/authority";
import type {
  AdaptiveDelegationDismissReason,
  AdaptiveDelegationEventType,
  AdaptiveDelegationRecommendationView,
  AdaptiveDelegationStats,
  AdaptiveDelegationThresholds
} from "@/lib/adaptiveDelegation/types";
import { DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS } from "@/lib/adaptiveDelegation/types";

function toView(doc: Record<string, unknown>, agentName?: string | null): AdaptiveDelegationRecommendationView {
  return {
    recommendationId: String(doc.recommendationId),
    accountId: String(doc.accountId),
    agentId: String(doc.agentId),
    agentName: agentName ?? null,
    kind: doc.kind as AdaptiveDelegationRecommendationView["kind"],
    status: doc.status as AdaptiveDelegationRecommendationView["status"],
    action: String(doc.action),
    resource: (doc.resource as string | null | undefined) ?? null,
    confidence: Number(doc.confidence),
    explanation: String(doc.explanation),
    factors: (doc.factors as AdaptiveDelegationRecommendationView["factors"]) ?? [],
    evidence: doc.evidence as AdaptiveDelegationRecommendationView["evidence"],
    proposedPermission: (doc.proposedPermission as AdaptiveDelegationRecommendationView["proposedPermission"]) ?? null,
    proposedTrustProfile:
      (doc.proposedTrustProfile as AdaptiveDelegationRecommendationView["proposedTrustProfile"]) ?? null,
    proposedOrgDelegation:
      (doc.proposedOrgDelegation as AdaptiveDelegationRecommendationView["proposedOrgDelegation"]) ?? null,
    affectedTools: (doc.affectedTools as string[]) ?? [],
    affectedResources: (doc.affectedResources as string[]) ?? [],
    estimatedApprovalReduction: Number(doc.estimatedApprovalReduction ?? 0),
    securityImpact: doc.securityImpact as AdaptiveDelegationRecommendationView["securityImpact"],
    rollbackInstructions: String(doc.rollbackInstructions),
    fingerprint: String(doc.fingerprint),
    dismissReason: (doc.dismissReason as AdaptiveDelegationDismissReason | null | undefined) ?? null,
    remindAt: doc.remindAt ? new Date(doc.remindAt as Date).toISOString() : null,
    acceptedPermissionId: (doc.acceptedPermissionId as string | null | undefined) ?? null,
    acceptedProfileId: (doc.acceptedProfileId as string | null | undefined) ?? null,
    acceptedAgentIds: Array.isArray(doc.acceptedAgentIds)
      ? (doc.acceptedAgentIds as string[])
      : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt as Date).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as Date).toISOString() : undefined
  };
}

async function recordEvent(options: {
  accountId: string;
  recommendationId: string;
  type: AdaptiveDelegationEventType;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await AdaptiveDelegationEvent.create({
    eventId: createPublicId("adev"),
    accountId: options.accountId,
    recommendationId: options.recommendationId,
    actorUserId: options.actorUserId ?? null,
    type: options.type,
    metadata: options.metadata
  });
}

async function loadExistingAutoAllowKeys(accountId: string): Promise<Set<string>> {
  const permissions = await Permission.find({
    accountId,
    status: "active",
    requiresApproval: { $ne: true },
    $or: [{ "constraints.expiresAt": null }, { "constraints.expiresAt": { $exists: false } }, { "constraints.expiresAt": { $gt: new Date() } }]
  })
    .select("agentId action resource")
    .lean<Array<{ agentId: string; action: string; resource?: string | null }>>();

  const keys = new Set<string>();
  for (const permission of permissions) {
    keys.add(autoAllowKey(permission.agentId, permission.action, permission.resource ?? null));
  }
  return keys;
}

async function loadSuppressionSets(accountId: string): Promise<{
  suppressed: Set<string>;
  postponed: Set<string>;
}> {
  const now = new Date();
  const rows = await AdaptiveDelegationRecommendation.find({
    accountId,
    status: { $in: ["dismissed", "postponed", "accepted"] }
  })
    .select("fingerprint status dismissReason remindAt")
    .lean<
      Array<{
        fingerprint: string;
        status: string;
        dismissReason?: string | null;
        remindAt?: Date | null;
      }>
    >();

  const suppressed = new Set<string>();
  const postponed = new Set<string>();

  for (const row of rows) {
    if (row.status === "accepted") {
      suppressed.add(row.fingerprint);
      continue;
    }
    if (row.status === "dismissed" && row.dismissReason === "never_suggest") {
      suppressed.add(row.fingerprint);
      continue;
    }
    if (row.status === "postponed" && row.remindAt && row.remindAt > now) {
      postponed.add(row.fingerprint);
    }
  }

  return { suppressed, postponed };
}

async function loadExistingTrustProfileKeys(accountId: string): Promise<Set<string>> {
  const rows = await AdaptiveDelegationRecommendation.find({
    accountId,
    kind: "trust_profile",
    status: "accepted",
    acceptedProfileId: { $ne: null }
  })
    .select("agentId proposedTrustProfile.templateId action")
    .lean<
      Array<{
        agentId: string;
        action?: string;
        proposedTrustProfile?: { templateId?: string } | null;
      }>
    >();

  const keys = new Set<string>();
  for (const row of rows) {
    const templateId =
      row.proposedTrustProfile?.templateId ??
      (typeof row.action === "string" && row.action.startsWith("trust_profile:")
        ? row.action.slice("trust_profile:".length)
        : null);
    if (templateId) keys.add(trustProfileKey(row.agentId, templateId));
  }
  return keys;
}

async function loadExistingOrgTemplateIds(accountId: string): Promise<Set<string>> {
  const rows = await AdaptiveDelegationRecommendation.find({
    accountId,
    kind: "organization_delegation",
    status: "accepted",
    acceptedProfileId: { $ne: null }
  })
    .select("proposedOrgDelegation.templateId action")
    .lean<
      Array<{
        action?: string;
        proposedOrgDelegation?: { templateId?: string } | null;
      }>
    >();

  const ids = new Set<string>();
  for (const row of rows) {
    const templateId =
      row.proposedOrgDelegation?.templateId ??
      (typeof row.action === "string" && row.action.startsWith("org_template:")
        ? row.action.slice("org_template:".length)
        : null);
    if (templateId) ids.add(templateId);
  }
  return ids;
}

export async function refreshAdaptiveDelegationRecommendations(options: {
  accountId: string;
  thresholds?: Partial<AdaptiveDelegationThresholds>;
}): Promise<{ created: number; updated: number; recommendations: AdaptiveDelegationRecommendationView[] }> {
  const thresholds: AdaptiveDelegationThresholds = {
    ...DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS,
    ...options.thresholds
  };

  const [
    patterns,
    contextPatterns,
    existingKeys,
    existingProfiles,
    existingOrgTemplates,
    suppression,
    agents
  ] = await Promise.all([
    loadApprovalPatterns({ accountId: options.accountId, lookbackDays: thresholds.lookbackDays }),
    loadContextPatterns({ accountId: options.accountId, lookbackDays: thresholds.lookbackDays }),
    loadExistingAutoAllowKeys(options.accountId),
    loadExistingTrustProfileKeys(options.accountId),
    loadExistingOrgTemplateIds(options.accountId),
    loadSuppressionSets(options.accountId),
    Agent.find({ accountId: options.accountId })
      .select("agentId name")
      .lean<Array<{ agentId: string; name?: string }>>()
  ]);

  const agentNames = new Map(agents.map((agent) => [agent.agentId, agent.name ?? agent.agentId]));
  const engine = new AdaptiveDelegationEngine(thresholds);
  const generated = engine.generate({
    accountId: options.accountId,
    patterns,
    contextPatterns,
    suppressedFingerprints: suppression.suppressed,
    postponedFingerprints: suppression.postponed,
    existingAutoAllowKeys: existingKeys,
    existingTrustProfileKeys: existingProfiles,
    existingOrgTemplateIds: existingOrgTemplates,
    agentNames
  });

  let created = 0;
  let updated = 0;
  const views: AdaptiveDelegationRecommendationView[] = [];

  for (const candidate of generated) {
    const existing = await AdaptiveDelegationRecommendation.findOne({
      accountId: options.accountId,
      fingerprint: candidate.fingerprint
    });

    if (existing) {
      if (existing.status === "accepted") {
        continue;
      }
      if (existing.status === "dismissed" && existing.dismissReason === "never_suggest") {
        continue;
      }
      if (existing.status === "postponed" && existing.remindAt && existing.remindAt > new Date()) {
        continue;
      }

      const updatedDoc = await AdaptiveDelegationRecommendation.findOneAndUpdate(
        { recommendationId: existing.recommendationId },
        {
          $set: {
            status: "active",
            kind: candidate.kind,
            confidence: candidate.confidence,
            explanation: candidate.explanation,
            factors: candidate.factors,
            evidence: candidate.evidence,
            proposedPermission: candidate.proposedPermission ?? null,
            proposedTrustProfile: candidate.proposedTrustProfile ?? null,
            proposedOrgDelegation: candidate.proposedOrgDelegation ?? null,
            affectedTools: candidate.affectedTools,
            affectedResources: candidate.affectedResources,
            estimatedApprovalReduction: candidate.estimatedApprovalReduction,
            securityImpact: candidate.securityImpact,
            rollbackInstructions: candidate.rollbackInstructions,
            remindAt: null,
            dismissReason: null
          }
        },
        { new: true }
      );
      if (!updatedDoc) continue;
      updated += 1;
      views.push(toView(updatedDoc.toObject(), agentNames.get(updatedDoc.agentId)));
      continue;
    }

    const recommendationId = createPublicId("adrec");
    const doc = await AdaptiveDelegationRecommendation.create({
      recommendationId,
      accountId: candidate.accountId,
      agentId: candidate.agentId,
      kind: candidate.kind,
      status: "active",
      action: candidate.action,
      resource: candidate.resource,
      confidence: candidate.confidence,
      explanation: candidate.explanation,
      factors: candidate.factors,
      evidence: candidate.evidence,
      proposedPermission: candidate.proposedPermission ?? null,
      proposedTrustProfile: candidate.proposedTrustProfile ?? null,
      proposedOrgDelegation: candidate.proposedOrgDelegation ?? null,
      affectedTools: candidate.affectedTools,
      affectedResources: candidate.affectedResources,
      estimatedApprovalReduction: candidate.estimatedApprovalReduction,
      securityImpact: candidate.securityImpact,
      rollbackInstructions: candidate.rollbackInstructions,
      fingerprint: candidate.fingerprint
    });
    created += 1;
    await recordEvent({
      accountId: options.accountId,
      recommendationId,
      type: "recommendation_generated",
      metadata: {
        confidence: candidate.confidence,
        action: candidate.action,
        kind: candidate.kind
      }
    });
    views.push(toView(doc.toObject(), agentNames.get(doc.agentId)));
  }

  // Mark stale active recommendations that no longer qualify as superseded.
  const activeFingerprints = new Set(generated.map((item) => item.fingerprint));
  await AdaptiveDelegationRecommendation.updateMany(
    {
      accountId: options.accountId,
      status: "active",
      fingerprint: { $nin: [...activeFingerprints] }
    },
    { $set: { status: "superseded", resolvedAt: new Date() } }
  );

  return { created, updated, recommendations: views };
}

export async function listAdaptiveDelegationDashboard(options: {
  accountId: string;
  refresh?: boolean;
}): Promise<{
  recommendations: AdaptiveDelegationRecommendationView[];
  applied: AdaptiveDelegationRecommendationView[];
  dismissed: AdaptiveDelegationRecommendationView[];
  postponed: AdaptiveDelegationRecommendationView[];
  stats: AdaptiveDelegationStats;
  refreshed?: { created: number; updated: number };
}> {
  let refreshed: { created: number; updated: number } | undefined;
  if (options.refresh !== false) {
    const result = await refreshAdaptiveDelegationRecommendations({ accountId: options.accountId });
    refreshed = { created: result.created, updated: result.updated };
  }

  const [rows, agents, patterns] = await Promise.all([
    AdaptiveDelegationRecommendation.find({ accountId: options.accountId })
      .sort({ confidence: -1, updatedAt: -1 })
      .lean(),
    Agent.find({ accountId: options.accountId }).select("agentId name").lean<Array<{ agentId: string; name?: string }>>(),
    loadApprovalPatterns({
      accountId: options.accountId,
      lookbackDays: DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS.lookbackDays
    })
  ]);

  const agentNames = new Map(agents.map((agent) => [agent.agentId, agent.name ?? agent.agentId]));
  const views = rows.map((row) => toView(row as Record<string, unknown>, agentNames.get(String(row.agentId))));

  const recommendations = views.filter((row) => row.status === "active");
  const applied = views.filter((row) => row.status === "accepted");
  const dismissed = views.filter((row) => row.status === "dismissed");
  const postponed = views.filter((row) => row.status === "postponed");

  const engine = new AdaptiveDelegationEngine();
  const stats = engine.summarize(views, patterns, {
    active: recommendations.length,
    accepted: applied.length,
    dismissed: dismissed.length,
    postponed: postponed.length
  });

  return { recommendations, applied, dismissed, postponed, stats, refreshed };
}

export async function markRecommendationViewed(options: {
  accountId: string;
  recommendationId: string;
  actorUserId: string;
}) {
  const doc = await AdaptiveDelegationRecommendation.findOne({
    accountId: options.accountId,
    recommendationId: options.recommendationId
  });
  if (!doc) return { error: jsonError("Recommendation not found.", 404) };

  if (!doc.viewedAt) {
    doc.viewedAt = new Date();
    await doc.save();
    await recordEvent({
      accountId: options.accountId,
      recommendationId: options.recommendationId,
      type: "recommendation_viewed",
      actorUserId: options.actorUserId
    });
  }

  return { recommendation: toView(doc.toObject()) };
}

export async function acceptRecommendation(options: {
  actor: WorkspaceActor;
  userId: string;
  recommendationId: string;
  agentIds?: string[];
}) {
  const doc = await AdaptiveDelegationRecommendation.findOne({
    accountId: options.actor.accountId,
    recommendationId: options.recommendationId
  });
  if (!doc) return { error: jsonError("Recommendation not found.", 404) };
  if (doc.status !== "active" && doc.status !== "postponed") {
    return { error: jsonError("Recommendation is not actionable.", 409) };
  }

  if (doc.kind === "organization_delegation") {
    const proposed = doc.proposedOrgDelegation;
    if (!proposed?.templateId || !proposed.name || !Array.isArray(proposed.permissions)) {
      return { error: jsonError("Organization delegation recommendation is incomplete.", 409) };
    }

    const minAuthority = Math.max(
      Number(proposed.minAcceptAuthorityLevel ?? AUTHORITY_LEVELS.ENGINEERING_LEAD),
      AUTHORITY_LEVELS.ENGINEERING_LEAD
    );
    if (options.actor.authorityLevel < minAuthority) {
      return {
        error: jsonError(
          `Organization delegation requires authority level ${minAuthority} or higher.`,
          403
        )
      };
    }

    const proposedAgentIds = Array.isArray(proposed.agentIds)
      ? proposed.agentIds.map(String)
      : [];
    const requested =
      options.agentIds && options.agentIds.length > 0
        ? options.agentIds.map((id) => id.trim()).filter(Boolean)
        : proposedAgentIds;
    if (requested.length === 0) {
      return { error: jsonError("Select at least one agent to apply the organization template.") };
    }
    const invalid = requested.filter((agentId) => !proposedAgentIds.includes(agentId));
    if (invalid.length > 0) {
      return {
        error: jsonError(
          `agentIds must be a subset of the recommended agents. Invalid: ${invalid.join(", ")}`
        )
      };
    }

    const template = getOrgDelegationTemplate(proposed.templateId);
    const permissions = template
      ? toOrgProfilePermissionInputs(template)
      : proposed.permissions.map((permission) => ({
          action: permission.action,
          resource: permission.resource ?? undefined,
          requiresApproval: permission.requiresApproval,
          blockedActions: permission.blockedActions ?? undefined,
          notes: permission.notes ?? undefined
        }));

    const created = await createPermissionProfile(options.actor, {
      name: `Org: ${proposed.name}`,
      description:
        proposed.description ||
        `Created from Adaptive Delegation organization template (${proposed.templateId}).`,
      permissions
    });
    if ("error" in created && created.error) return { error: created.error };
    if (!("profile" in created) || !created.profile) {
      return { error: jsonError("Failed to create organization permission profile.") };
    }

    const profileId = String(created.profile.profileId);
    const permissionIds: string[] = [];
    for (const agentId of requested) {
      const applied = await applyPermissionProfile({
        actor: options.actor,
        userId: options.userId,
        agentId,
        profileId
      });
      if ("error" in applied && applied.error) return { error: applied.error };
      if (Array.isArray(applied.permissionIds)) permissionIds.push(...applied.permissionIds);
    }

    doc.status = "accepted";
    doc.acceptedProfileId = profileId;
    doc.acceptedPermissionId = permissionIds[0] ?? null;
    doc.acceptedAgentIds = requested;
    doc.acceptedBy = options.userId;
    doc.resolvedAt = new Date();
    await doc.save();

    await recordEvent({
      accountId: options.actor.accountId,
      recommendationId: options.recommendationId,
      type: "recommendation_accepted",
      actorUserId: options.userId,
      metadata: {
        kind: "organization_delegation",
        profileId,
        agentIds: requested,
        permissionIds
      }
    });

    return {
      recommendation: toView(doc.toObject()),
      permissionId: doc.acceptedPermissionId,
      profileId,
      agentIds: requested
    };
  }

  if (doc.kind === "trust_profile") {
    const proposed = doc.proposedTrustProfile;
    if (!proposed?.templateId || !proposed.name || !Array.isArray(proposed.permissions)) {
      return { error: jsonError("Trust profile recommendation is incomplete.", 409) };
    }

    const template = getTrustProfileTemplate(proposed.templateId);
    const permissions = template
      ? toProfilePermissionInputs(template)
      : proposed.permissions.map((permission) => ({
          action: permission.action,
          resource: permission.resource ?? undefined,
          requiresApproval: permission.requiresApproval,
          blockedActions: permission.blockedActions ?? undefined,
          notes: permission.notes ?? undefined
        }));

    const created = await createPermissionProfile(options.actor, {
      name: `${proposed.name} (${doc.agentId})`,
      description:
        proposed.description ||
        `Created from Adaptive Delegation trust profile recommendation (${proposed.templateId}).`,
      permissions
    });
    if ("error" in created && created.error) return { error: created.error };
    if (!("profile" in created) || !created.profile) {
      return { error: jsonError("Failed to create permission profile.") };
    }

    const profileId = String(created.profile.profileId);
    const applied = await applyPermissionProfile({
      actor: options.actor,
      userId: options.userId,
      agentId: doc.agentId,
      profileId
    });
    if ("error" in applied && applied.error) return { error: applied.error };

    doc.status = "accepted";
    doc.acceptedProfileId = profileId;
    doc.acceptedPermissionId = Array.isArray(applied.permissionIds)
      ? applied.permissionIds[0] ?? null
      : null;
    doc.acceptedBy = options.userId;
    doc.resolvedAt = new Date();
    await doc.save();

    await recordEvent({
      accountId: options.actor.accountId,
      recommendationId: options.recommendationId,
      type: "recommendation_accepted",
      actorUserId: options.userId,
      metadata: {
        kind: "trust_profile",
        profileId,
        permissionIds: "permissionIds" in applied ? applied.permissionIds : []
      }
    });

    return {
      recommendation: toView(doc.toObject()),
      permissionId: doc.acceptedPermissionId,
      profileId
    };
  }

  const proposed = doc.proposedPermission;
  if (!proposed?.action) {
    return { error: jsonError("Permission recommendation is incomplete.", 409) };
  }

  const result = await createPermissionForAgent({
    actor: options.actor,
    userId: options.userId,
    agentId: doc.agentId,
    body: {
      action: proposed.action,
      resource: proposed.resource,
      scope: proposed.scope,
      requiresApproval: proposed.requiresApproval === true,
      notes: proposed.notes,
      description: proposed.description,
      constraints: proposed.constraints ?? {}
    }
  });
  if ("error" in result && result.error) return { error: result.error };

  doc.status = "accepted";
  doc.acceptedPermissionId = "permissionId" in result ? result.permissionId ?? null : null;
  doc.acceptedBy = options.userId;
  doc.resolvedAt = new Date();
  await doc.save();

  await recordEvent({
    accountId: options.actor.accountId,
    recommendationId: options.recommendationId,
    type: "recommendation_accepted",
    actorUserId: options.userId,
    metadata: {
      kind: doc.kind,
      permissionId: doc.acceptedPermissionId,
      constraints: proposed.constraints ?? null
    }
  });

  return {
    recommendation: toView(doc.toObject()),
    permissionId: doc.acceptedPermissionId
  };
}

export async function dismissRecommendation(options: {
  accountId: string;
  userId: string;
  recommendationId: string;
  reason: AdaptiveDelegationDismissReason;
}) {
  const doc = await AdaptiveDelegationRecommendation.findOne({
    accountId: options.accountId,
    recommendationId: options.recommendationId
  });
  if (!doc) return { error: jsonError("Recommendation not found.", 404) };
  if (doc.status === "accepted") {
    return { error: jsonError("Accepted recommendations cannot be dismissed.", 409) };
  }

  // keep_manual = cool down; never_suggest = permanent suppression.
  if (options.reason === "keep_manual") {
    const remindAt = new Date(
      Date.now() + DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS.postponeDays * 24 * 60 * 60 * 1000
    );
    doc.status = "postponed";
    doc.dismissReason = options.reason;
    doc.dismissedBy = options.userId;
    doc.remindAt = remindAt;
    doc.resolvedAt = null;
    await doc.save();

    await recordEvent({
      accountId: options.accountId,
      recommendationId: options.recommendationId,
      type: "recommendation_dismissed",
      actorUserId: options.userId,
      metadata: { reason: options.reason, remindAt: remindAt.toISOString() }
    });

    return { recommendation: toView(doc.toObject()) };
  }

  doc.status = "dismissed";
  doc.dismissReason = options.reason;
  doc.dismissedBy = options.userId;
  doc.resolvedAt = new Date();
  doc.remindAt = null;
  await doc.save();

  await recordEvent({
    accountId: options.accountId,
    recommendationId: options.recommendationId,
    type: "recommendation_dismissed",
    actorUserId: options.userId,
    metadata: { reason: options.reason }
  });

  return { recommendation: toView(doc.toObject()) };
}

export async function postponeRecommendation(options: {
  accountId: string;
  userId: string;
  recommendationId: string;
  days?: number;
}) {
  const doc = await AdaptiveDelegationRecommendation.findOne({
    accountId: options.accountId,
    recommendationId: options.recommendationId
  });
  if (!doc) return { error: jsonError("Recommendation not found.", 404) };
  if (doc.status !== "active" && doc.status !== "postponed") {
    return { error: jsonError("Recommendation is not postponable.", 409) };
  }

  const days = options.days ?? DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS.postponeDays;
  const remindAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  doc.status = "postponed";
  doc.remindAt = remindAt;
  await doc.save();

  await recordEvent({
    accountId: options.accountId,
    recommendationId: options.recommendationId,
    type: "recommendation_postponed",
    actorUserId: options.userId,
    metadata: { remindAt: remindAt.toISOString(), days }
  });

  return { recommendation: toView(doc.toObject()) };
}
