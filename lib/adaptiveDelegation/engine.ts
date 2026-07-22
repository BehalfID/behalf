import crypto from "crypto";
import { classifyPermissionRisk } from "@/lib/permissionRisk";
import {
  buildEvidence,
  buildExplanation,
  calculateConfidence
} from "@/lib/adaptiveDelegation/confidence";
import {
  buildTrustProfileExplanation,
  matchTrustProfiles
} from "@/lib/adaptiveDelegation/profileMatching";
import {
  buildContextScopedExplanation,
  matchContextScopedPermissions
} from "@/lib/adaptiveDelegation/contextMatching";
import {
  buildOrgDelegationExplanation,
  matchOrgDelegationTemplates
} from "@/lib/adaptiveDelegation/orgMatching";
import {
  ORG_RECOMMENDATION_AGENT_ID,
  orgTemplateAuthorityLevel
} from "@/lib/adaptiveDelegation/orgTemplates";
import { trustProfileAuthorityLevel } from "@/lib/adaptiveDelegation/trustProfiles";
import type {
  AdaptiveDelegationRecommendationView,
  AdaptiveDelegationStats,
  AdaptiveDelegationThresholds,
  ApprovalPatternAggregate,
  ContextPatternAggregate,
  ProposedPermission,
  SecurityImpact
} from "@/lib/adaptiveDelegation/types";
import { DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS } from "@/lib/adaptiveDelegation/types";

export type EngineInput = {
  accountId: string;
  patterns: ApprovalPatternAggregate[];
  contextPatterns?: ContextPatternAggregate[];
  /** Fingerprints the account has permanently suppressed. */
  suppressedFingerprints?: Set<string>;
  /** Fingerprints currently postponed past now. */
  postponedFingerprints?: Set<string>;
  /** Actions that already have a non-approval permission for the agent. */
  existingAutoAllowKeys?: Set<string>;
  /** agentId|templateId pairs already applied. */
  existingTrustProfileKeys?: Set<string>;
  /** Org template ids already accepted for this account. */
  existingOrgTemplateIds?: Set<string>;
  thresholds?: Partial<AdaptiveDelegationThresholds>;
  agentNames?: Map<string, string>;
};

function normalizeResource(resource: string | null | undefined): string | null {
  if (!resource) return null;
  const trimmed = resource.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

export function buildRecommendationFingerprint(input: {
  accountId: string;
  agentId: string;
  action: string;
  resource?: string | null;
  kind?: "reusable_permission" | "trust_profile" | "context_scoped_permission" | "organization_delegation";
}): string {
  const payload = [
    input.accountId,
    input.agentId,
    input.action.trim().toLowerCase(),
    normalizeResource(input.resource) ?? "",
    input.kind ?? "reusable_permission"
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function autoAllowKey(agentId: string, action: string, resource?: string | null): string {
  return `${agentId}|${action.trim().toLowerCase()}|${normalizeResource(resource) ?? ""}`;
}

export function trustProfileKey(agentId: string, templateId: string): string {
  return `${agentId}|${templateId}`;
}

function estimatedReduction(pattern: ApprovalPatternAggregate): number {
  return Math.max(pattern.usedCount, pattern.approvedCount);
}

function buildProposedPermission(pattern: ApprovalPatternAggregate): ProposedPermission {
  const resource = normalizeResource(pattern.resource) ?? undefined;
  return {
    action: pattern.action,
    resource,
    requiresApproval: false,
    notes: "Created from Adaptive Delegation recommendation (explicit human acceptance).",
    description: resource
      ? `Reusable permission for ${pattern.action} on ${resource}`
      : `Reusable permission for ${pattern.action}`
  };
}

function buildSecurityImpact(pattern: ApprovalPatternAggregate): SecurityImpact {
  const classification = classifyPermissionRisk({
    action: pattern.action,
    resource: pattern.resource,
    requiresApproval: false
  });
  const riskNotes: string[] = [
    "Accepting creates a Permission through the existing permission mutation path.",
    "verifyAction() remains the sole authorization decision point.",
    "This recommendation never auto-approves or auto-grants authority."
  ];
  if (classification.requiredAuthorityLevel >= 60) {
    riskNotes.push("This action is classified as sensitive; review carefully before accepting.");
  }
  if (pattern.deniedCount > 0) {
    riskNotes.push("Prior denials exist for this pattern; confidence is reduced accordingly.");
  }

  return {
    summary:
      "Accepting removes the repeated approval gate for matching requests by creating an explicit reusable permission. Hard constraints, blocked actions, path/command policy, and verifyAction() still apply.",
    authorityLevel: classification.requiredAuthorityLevel,
    removesApprovalGate: true,
    riskNotes
  };
}

function toPermissionRecommendation(
  pattern: ApprovalPatternAggregate,
  thresholds: AdaptiveDelegationThresholds,
  agentNames?: Map<string, string>
): AdaptiveDelegationRecommendationView | null {
  if (pattern.approvedCount < thresholds.minApprovals) return null;

  const { confidence, factors } = calculateConfidence(pattern);
  if (confidence < thresholds.minConfidence) return null;

  const resolved = pattern.approvedCount + pattern.deniedCount;
  if (resolved > 0 && pattern.deniedCount / resolved > 0.2) return null;

  const fingerprint = buildRecommendationFingerprint({
    accountId: pattern.accountId,
    agentId: pattern.agentId,
    action: pattern.action,
    resource: pattern.resource,
    kind: "reusable_permission"
  });

  const resource = normalizeResource(pattern.resource);

  return {
    recommendationId: "",
    accountId: pattern.accountId,
    agentId: pattern.agentId,
    agentName: agentNames?.get(pattern.agentId) ?? null,
    kind: "reusable_permission",
    status: "active",
    action: pattern.action,
    resource,
    confidence,
    explanation: buildExplanation(pattern, confidence),
    factors,
    evidence: buildEvidence(pattern),
    proposedPermission: buildProposedPermission(pattern),
    proposedTrustProfile: null,
    affectedTools: [pattern.action],
    affectedResources: resource ? [resource] : pattern.resources.slice(0, 8),
    estimatedApprovalReduction: estimatedReduction(pattern),
    securityImpact: buildSecurityImpact(pattern),
    rollbackInstructions:
      "Revoke the created permission from the agent’s Permissions panel, or set requiresApproval back to true on a replacement permission. Adaptive Delegation never silently restores authority.",
    fingerprint
  };
}

function toTrustProfileRecommendation(
  match: ReturnType<typeof matchTrustProfiles>[number],
  agentNames?: Map<string, string>
): AdaptiveDelegationRecommendationView {
  const fingerprint = buildRecommendationFingerprint({
    accountId: match.accountId,
    agentId: match.agentId,
    action: `trust_profile:${match.template.id}`,
    resource: match.template.resourceScope,
    kind: "trust_profile"
  });

  const authorityLevel = trustProfileAuthorityLevel(match.template);
  const removesApprovalGate = match.proposedTrustProfile.permissions.some(
    (permission) => !permission.requiresApproval
  );

  return {
    recommendationId: "",
    accountId: match.accountId,
    agentId: match.agentId,
    agentName: agentNames?.get(match.agentId) ?? null,
    kind: "trust_profile",
    status: "active",
    action: `trust_profile:${match.template.id}`,
    resource: match.template.resourceScope,
    confidence: match.confidence,
    explanation: buildTrustProfileExplanation(match),
    factors: match.factors,
    evidence: match.evidence,
    proposedPermission: null,
    proposedTrustProfile: match.proposedTrustProfile,
    affectedTools: match.proposedTrustProfile.permissions.map((permission) => permission.action),
    affectedResources: [match.template.resourceScope],
    estimatedApprovalReduction: match.estimatedApprovalReduction,
    securityImpact: {
      summary:
        "Accepting creates a PermissionProfile and applies it to this agent through existing profile mutation paths. Elevated profile permissions keep requiresApproval. verifyAction() remains the sole authorization decision point.",
      authorityLevel,
      removesApprovalGate,
      riskNotes: [
        "Trust profiles are enabled only after explicit confirmation.",
        "Profile permissions that require approval continue to create ApprovalRequests.",
        "Hard constraints, blocked actions, and path/command policy still apply on every verify().",
        ...(match.unmatchedActions.length
          ? [`Unmatched template actions (not yet evidenced): ${match.unmatchedActions.join(", ")}`]
          : [])
      ]
    },
    rollbackInstructions:
      "Revoke the permissions created by the applied profile from the agent’s Permissions panel, and archive the PermissionProfile if it should no longer be reused. Adaptive Delegation never silently restores authority.",
    fingerprint
  };
}

function toContextScopedRecommendation(
  match: ReturnType<typeof matchContextScopedPermissions>[number],
  agentNames?: Map<string, string>
): AdaptiveDelegationRecommendationView {
  const fingerprint = buildRecommendationFingerprint({
    accountId: match.accountId,
    agentId: match.agentId,
    action: match.action,
    resource: `${match.dimension}:${match.safeValues.join(",")}`,
    kind: "context_scoped_permission"
  });

  const classification = classifyPermissionRisk({
    action: match.action,
    requiresApproval: false,
    resource: match.protectedValues[0] ?? match.safeValues[0]
  });

  return {
    recommendationId: "",
    accountId: match.accountId,
    agentId: match.agentId,
    agentName: agentNames?.get(match.agentId) ?? null,
    kind: "context_scoped_permission",
    status: "active",
    action: match.action,
    resource: match.proposedPermission.scope ?? null,
    confidence: match.confidence,
    explanation: buildContextScopedExplanation(match),
    factors: match.factors,
    evidence: match.evidence,
    proposedPermission: match.proposedPermission,
    proposedTrustProfile: null,
    affectedTools: [match.action],
    affectedResources: [...match.safeValues, ...match.protectedValues],
    estimatedApprovalReduction: match.estimatedApprovalReduction,
    securityImpact: {
      summary:
        "Accepting creates a Permission with Stage 5 context constraints (allowed/denied branches, environments, or repositories). Matching verify() calls in safe contexts skip repeated approval; protected contexts remain outside this permission so existing approval-gated permissions can still apply. verifyAction() remains the sole decision point.",
      authorityLevel: classification.requiredAuthorityLevel,
      removesApprovalGate: true,
      riskNotes: [
        "Context is read from verify() metadata (repository/branch/environment), not policyContext.",
        "Protected contexts are excluded via allowed* / denied* constraints — not auto-approved.",
        "Hard path/command/vendor constraints still apply on every verify()."
      ]
    },
    rollbackInstructions:
      "Revoke the created context-scoped permission from the agent’s Permissions panel. Adaptive Delegation never silently restores authority.",
    fingerprint
  };
}

function toOrgDelegationRecommendation(
  match: ReturnType<typeof matchOrgDelegationTemplates>[number]
): AdaptiveDelegationRecommendationView {
  const fingerprint = buildRecommendationFingerprint({
    accountId: match.accountId,
    agentId: ORG_RECOMMENDATION_AGENT_ID,
    action: `org_template:${match.template.id}`,
    resource: match.template.department,
    kind: "organization_delegation"
  });

  const authorityLevel = orgTemplateAuthorityLevel(match.template);
  const removesApprovalGate = match.proposedOrgDelegation.permissions.some(
    (permission) => !permission.requiresApproval
  );

  return {
    recommendationId: "",
    accountId: match.accountId,
    agentId: ORG_RECOMMENDATION_AGENT_ID,
    agentName: `${match.agentIds.length} agents`,
    kind: "organization_delegation",
    status: "active",
    action: `org_template:${match.template.id}`,
    resource: match.template.department,
    confidence: match.confidence,
    explanation: buildOrgDelegationExplanation(match),
    factors: match.factors,
    evidence: match.evidence,
    proposedPermission: null,
    proposedTrustProfile: null,
    proposedOrgDelegation: match.proposedOrgDelegation,
    affectedTools: match.proposedOrgDelegation.permissions.map((permission) => permission.action),
    affectedResources: [match.template.department],
    estimatedApprovalReduction: match.estimatedApprovalReduction,
    securityImpact: {
      summary:
        "Accepting creates one account-scoped PermissionProfile and applies it only to agents you explicitly select. Managed profile / workspace policies remain governing. verifyAction() remains the sole authorization decision point.",
      authorityLevel,
      removesApprovalGate,
      riskNotes: [
        "Organization delegation never silently applies to the full agent fleet.",
        "Accept requires workspace authority at or above the template minimum (Lead/Owner for sensitive templates).",
        "Elevated permissions inside the org template keep requiresApproval.",
        "ManagedProfilePolicy and membership roles continue to govern independently."
      ]
    },
    rollbackInstructions:
      "Revoke permissions created by the applied profile on each agent, and archive the PermissionProfile if it should no longer be reused. Adaptive Delegation never silently restores authority.",
    fingerprint
  };
}

/**
 * AdaptiveDelegationEngine — advisory only.
 *
 * Stage 3: reusable permission recommendations
 * Stage 4: trust profile (authority bundle) recommendations
 * Stage 5: context-scoped permission recommendations
 * Stage 6: organization delegation templates (multi-agent)
 *
 * Never modifies Permissions, Approvals, or verifyAction() outcomes directly.
 */
export class AdaptiveDelegationEngine {
  constructor(private readonly thresholds: AdaptiveDelegationThresholds = DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS) {}

  generate(input: EngineInput): AdaptiveDelegationRecommendationView[] {
    const thresholds: AdaptiveDelegationThresholds = {
      ...this.thresholds,
      ...input.thresholds
    };
    const suppressed = input.suppressedFingerprints ?? new Set<string>();
    const postponed = input.postponedFingerprints ?? new Set<string>();
    const existing = input.existingAutoAllowKeys ?? new Set<string>();
    const existingProfiles = input.existingTrustProfileKeys ?? new Set<string>();
    const existingOrgTemplates = input.existingOrgTemplateIds ?? new Set<string>();

    const recommendations: AdaptiveDelegationRecommendationView[] = [];

    for (const pattern of input.patterns) {
      if (pattern.accountId !== input.accountId) continue;

      const candidate = toPermissionRecommendation(pattern, thresholds, input.agentNames);
      if (!candidate) continue;
      if (suppressed.has(candidate.fingerprint)) continue;
      if (postponed.has(candidate.fingerprint)) continue;

      const key = autoAllowKey(pattern.agentId, pattern.action, pattern.resource);
      if (existing.has(key)) continue;

      recommendations.push(candidate);
    }

    const agentIds = [
      ...new Set([
        ...input.patterns.map((pattern) => pattern.agentId),
        ...(input.contextPatterns ?? []).map((pattern) => pattern.agentId)
      ])
    ];
    for (const agentId of agentIds) {
      const matches = matchTrustProfiles({
        accountId: input.accountId,
        agentId,
        patterns: input.patterns,
        thresholds
      });

      for (const match of matches) {
        if (existingProfiles.has(trustProfileKey(agentId, match.template.id))) continue;
        const candidate = toTrustProfileRecommendation(match, input.agentNames);
        if (suppressed.has(candidate.fingerprint)) continue;
        if (postponed.has(candidate.fingerprint)) continue;
        recommendations.push(candidate);
      }

      if (input.contextPatterns?.length) {
        const contextMatches = matchContextScopedPermissions({
          accountId: input.accountId,
          agentId,
          contextPatterns: input.contextPatterns,
          thresholds
        });
        for (const match of contextMatches) {
          const candidate = toContextScopedRecommendation(match, input.agentNames);
          if (suppressed.has(candidate.fingerprint)) continue;
          if (postponed.has(candidate.fingerprint)) continue;
          recommendations.push(candidate);
        }
      }
    }

    const orgMatches = matchOrgDelegationTemplates({
      accountId: input.accountId,
      patterns: input.patterns,
      thresholds,
      agentNames: input.agentNames
    });
    for (const match of orgMatches) {
      if (existingOrgTemplates.has(match.template.id)) continue;
      const candidate = toOrgDelegationRecommendation(match);
      if (suppressed.has(candidate.fingerprint)) continue;
      if (postponed.has(candidate.fingerprint)) continue;
      recommendations.push(candidate);
    }

    return recommendations.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.estimatedApprovalReduction - a.estimatedApprovalReduction;
    });
  }

  summarize(
    recommendations: AdaptiveDelegationRecommendationView[],
    patterns: ApprovalPatternAggregate[],
    statusCounts: {
      active: number;
      accepted: number;
      dismissed: number;
      postponed: number;
    }
  ): AdaptiveDelegationStats {
    const active = recommendations.filter((row) => row.status === "active");
    const approved = [...patterns]
      .filter((p) => p.approvedCount > 0)
      .sort((a, b) => b.approvedCount - a.approvedCount)
      .slice(0, 10)
      .map((p) => ({
        action: p.action,
        resource: p.resource,
        count: p.approvedCount
      }));

    const denied = [...patterns]
      .filter((p) => p.deniedCount > 0)
      .sort((a, b) => b.deniedCount - a.deniedCount)
      .slice(0, 10)
      .map((p) => ({
        action: p.action,
        resource: p.resource,
        count: p.deniedCount
      }));

    return {
      activeRecommendations: statusCounts.active,
      acceptedRecommendations: statusCounts.accepted,
      dismissedRecommendations: statusCounts.dismissed,
      postponedRecommendations: statusCounts.postponed,
      estimatedApprovalReduction: active.reduce((sum, r) => sum + r.estimatedApprovalReduction, 0),
      activePermissionRecommendations: active.filter((r) => r.kind === "reusable_permission").length,
      activeTrustProfileRecommendations: active.filter((r) => r.kind === "trust_profile").length,
      activeContextRecommendations: active.filter((r) => r.kind === "context_scoped_permission").length,
      activeOrgRecommendations: active.filter((r) => r.kind === "organization_delegation").length,
      frequentlyApproved: approved,
      frequentlyDenied: denied
    };
  }
}
