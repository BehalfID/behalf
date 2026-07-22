import { classifyPermissionRisk } from "@/lib/permissionRisk";
import {
  isProtectedBranch,
  isProtectedEnvironment
} from "@/lib/adaptiveDelegation/context";
import type {
  AdaptiveDelegationThresholds,
  ConfidenceFactor,
  ContextPatternAggregate,
  ProposedPermission,
  RecommendationEvidence
} from "@/lib/adaptiveDelegation/types";

export type ContextScopedMatch = {
  accountId: string;
  agentId: string;
  action: string;
  dimension: "branch" | "environment" | "repository";
  confidence: number;
  factors: ConfidenceFactor[];
  evidence: RecommendationEvidence;
  estimatedApprovalReduction: number;
  proposedPermission: ProposedPermission;
  safeValues: string[];
  protectedValues: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scoreContextSplit(options: {
  safeApproved: number;
  safeDenied: number;
  protectedApproved: number;
  protectedDenied: number;
  safeValues: string[];
  protectedValues: string[];
  dimension: string;
}): { confidence: number; factors: ConfidenceFactor[] } {
  const factors: ConfidenceFactor[] = [];
  let score = 0;

  const safeVolume = Math.min(35, options.safeApproved * 2);
  factors.push({
    code: "safe_context_approvals",
    label: `${options.safeApproved} approvals in safe ${options.dimension} context(s)`,
    delta: safeVolume,
    polarity: "positive"
  });
  score += safeVolume;

  if (options.safeDenied === 0 && options.safeApproved >= 5) {
    factors.push({
      code: "zero_safe_denials",
      label: `Zero denials in safe ${options.dimension} contexts`,
      delta: 20,
      polarity: "positive"
    });
    score += 20;
  }

  if (options.protectedValues.length > 0) {
    factors.push({
      code: "protected_contrast",
      label: `Protected ${options.dimension} contexts remain distinct (${options.protectedValues.join(", ")})`,
      delta: 15,
      polarity: "positive"
    });
    score += 15;
  }

  if (options.protectedDenied > 0 || options.protectedApproved < options.safeApproved / 2) {
    factors.push({
      code: "protected_caution",
      label: "Protected contexts show fewer approvals or prior denials",
      delta: 10,
      polarity: "positive"
    });
    score += 10;
  }

  if (options.safeValues.length >= 2) {
    factors.push({
      code: "multi_safe_values",
      label: `${options.safeValues.length} safe ${options.dimension} values observed`,
      delta: 8,
      polarity: "positive"
    });
    score += 8;
  }

  if (options.safeDenied > 0) {
    const penalty = Math.min(30, options.safeDenied * 12);
    factors.push({
      code: "safe_context_denials",
      label: `${options.safeDenied} denial(s) inside proposed safe context`,
      delta: -penalty,
      polarity: "negative"
    });
    score -= penalty;
  }

  return { confidence: clamp(Math.round(score), 0, 100), factors };
}

function buildProposedForDimension(
  action: string,
  dimension: "branch" | "environment" | "repository",
  safeValues: string[],
  protectedValues: string[]
): ProposedPermission {
  const constraints: ProposedPermission["constraints"] = {};
  let scope = "";

  if (dimension === "branch") {
    constraints.allowedBranches = safeValues;
    if (protectedValues.length) constraints.deniedBranches = protectedValues;
    scope = `branch in [${safeValues.join(", ")}]; keep approval on [${protectedValues.join(", ") || "protected branches"}]`;
  } else if (dimension === "environment") {
    constraints.allowedEnvironments = safeValues;
    if (protectedValues.length) constraints.deniedEnvironments = protectedValues;
    scope = `environment in [${safeValues.join(", ")}]; keep approval on [${protectedValues.join(", ") || "protected environments"}]`;
  } else {
    constraints.allowedRepositories = safeValues;
    scope = `repository in [${safeValues.join(", ")}]`;
  }

  return {
    action,
    scope,
    requiresApproval: false,
    notes: `Adaptive Delegation Stage 5 context-scoped permission (${dimension}). Protected contexts stay outside allowed* constraints so approval-gated permissions can still apply.`,
    description: `Allow ${action} in safe ${dimension} contexts without repeated approval`,
    constraints
  };
}

/**
 * Detect Stage 5 context splits: repeated approvals in safe contexts with
 * contrast against protected contexts (main/prod).
 */
export function matchContextScopedPermissions(options: {
  accountId: string;
  agentId: string;
  contextPatterns: ContextPatternAggregate[];
  thresholds: AdaptiveDelegationThresholds;
}): ContextScopedMatch[] {
  const byActionDimension = new Map<string, ContextPatternAggregate[]>();

  for (const pattern of options.contextPatterns) {
    if (pattern.accountId !== options.accountId || pattern.agentId !== options.agentId) continue;
    const key = `${pattern.action}\0${pattern.dimension}`;
    const list = byActionDimension.get(key) ?? [];
    list.push(pattern);
    byActionDimension.set(key, list);
  }

  const matches: ContextScopedMatch[] = [];

  for (const [, slices] of byActionDimension) {
    const dimension = slices[0]?.dimension;
    const action = slices[0]?.action;
    if (!dimension || !action) continue;

    const safe = slices.filter((slice) => !slice.protected && slice.approvedCount > 0);
    const protectedSlices = slices.filter((slice) => slice.protected);

    const safeApproved = safe.reduce((sum, slice) => sum + slice.approvedCount, 0);
    const safeDenied = safe.reduce((sum, slice) => sum + slice.deniedCount, 0);
    const protectedApproved = protectedSlices.reduce((sum, slice) => sum + slice.approvedCount, 0);
    const protectedDenied = protectedSlices.reduce((sum, slice) => sum + slice.deniedCount, 0);

    if (safeApproved < options.thresholds.minContextApprovals) continue;
    if (safeDenied / Math.max(1, safeApproved + safeDenied) > 0.2) continue;

    const safeValues = [...new Set(safe.map((slice) => slice.value))];
    const protectedValues = [...new Set(protectedSlices.map((slice) => slice.value))];
    if (protectedValues.length === 0 && safeValues.length < 2) continue;

    const { confidence, factors } = scoreContextSplit({
      safeApproved,
      safeDenied,
      protectedApproved,
      protectedDenied,
      safeValues,
      protectedValues,
      dimension
    });

    const authority = classifyPermissionRisk({
      action,
      requiresApproval: false,
      resource: protectedValues[0] ?? safeValues[0]
    }).requiredAuthorityLevel;

    const adjustedFactors =
      authority >= 60
        ? [
            ...factors,
            {
              code: "sensitive_action",
              label: "Action classification is sensitive — review carefully",
              delta: -10,
              polarity: "negative" as const
            }
          ]
        : factors;
    const adjustedConfidence = clamp(confidence + (authority >= 60 ? -10 : 0), 0, 100);
    if (adjustedConfidence < options.thresholds.minConfidence) continue;

    const sampleApprovalIds = safe.flatMap((slice) => slice.sampleApprovalIds).slice(0, 8);
    const firstSeenAt = safe
      .map((slice) => slice.firstSeenAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const lastSeenAt = safe
      .map((slice) => slice.lastSeenAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const evidence: RecommendationEvidence = {
      approvedCount: safeApproved,
      deniedCount: safeDenied,
      usedCount: safe.reduce((sum, slice) => sum + slice.usedCount, 0),
      pendingCount: 0,
      approvalRequiredLogCount: 0,
      distinctAgents: 1,
      distinctResources: safeValues.length,
      sameAgent: true,
      sameResource: false,
      historyDays:
        firstSeenAt && lastSeenAt
          ? Math.floor(Math.max(0, lastSeenAt.getTime() - firstSeenAt.getTime()) / (24 * 60 * 60 * 1000))
          : 0,
      firstSeenAt: firstSeenAt?.toISOString() ?? null,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
      sampleApprovalIds,
      context: {
        dimension,
        safeValues,
        protectedValues,
        safeApprovedCount: safeApproved,
        protectedApprovedCount: protectedApproved,
        protectedDeniedCount: protectedDenied
      }
    };

    matches.push({
      accountId: options.accountId,
      agentId: options.agentId,
      action,
      dimension,
      confidence: adjustedConfidence,
      factors: adjustedFactors,
      evidence,
      estimatedApprovalReduction: safeApproved,
      proposedPermission: buildProposedForDimension(action, dimension, safeValues, protectedValues),
      safeValues,
      protectedValues
    });
  }

  return matches.sort(
    (a, b) => b.confidence - a.confidence || b.estimatedApprovalReduction - a.estimatedApprovalReduction
  );
}

export function buildContextScopedExplanation(match: ContextScopedMatch): string {
  const protectedPart = match.protectedValues.length
    ? ` Keep approval required for ${match.dimension} [${match.protectedValues.join(", ")}].`
    : "";
  return (
    `You have approved "${match.action}" ${match.evidence.approvedCount} times in safe ${match.dimension} ` +
    `context(s) [${match.safeValues.join(", ")}] with ${match.evidence.deniedCount} denials ` +
    `(confidence ${match.confidence}%).` +
    protectedPart +
    ` Would you like to create a context-scoped reusable permission?`
  );
}

export function isSliceProtected(
  dimension: "branch" | "environment" | "repository",
  value: string
): boolean {
  if (dimension === "branch") return isProtectedBranch(value);
  if (dimension === "environment") return isProtectedEnvironment(value);
  return /production|prod|live/i.test(value);
}
