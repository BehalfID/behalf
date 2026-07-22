import { calculateConfidence } from "@/lib/adaptiveDelegation/confidence";
import type {
  AdaptiveDelegationThresholds,
  ApprovalPatternAggregate,
  ConfidenceFactor,
  ProposedTrustProfile,
  RecommendationEvidence
} from "@/lib/adaptiveDelegation/types";
import {
  TRUST_PROFILE_TEMPLATES,
  actionMatchesProfileSlot,
  toProfilePermissionInputs,
  trustProfileAuthorityLevel,
  type TrustProfileTemplate
} from "@/lib/adaptiveDelegation/trustProfiles";

export type TrustProfileMatch = {
  template: TrustProfileTemplate;
  agentId: string;
  accountId: string;
  matchedPatterns: ApprovalPatternAggregate[];
  unmatchedActions: string[];
  coveragePercent: number;
  confidence: number;
  factors: ConfidenceFactor[];
  evidence: RecommendationEvidence;
  estimatedApprovalReduction: number;
  proposedTrustProfile: ProposedTrustProfile;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function historyDays(first: Date | null, last: Date | null): number {
  if (!first || !last) return 0;
  return Math.floor(Math.max(0, last.getTime() - first.getTime()) / (24 * 60 * 60 * 1000));
}

function aggregateEvidence(patterns: ApprovalPatternAggregate[]): RecommendationEvidence {
  const resources = new Set<string>();
  const sampleApprovalIds: string[] = [];
  let approvedCount = 0;
  let deniedCount = 0;
  let usedCount = 0;
  let pendingCount = 0;
  let approvalRequiredLogCount = 0;
  let firstSeenAt: Date | null = null;
  let lastSeenAt: Date | null = null;

  for (const pattern of patterns) {
    approvedCount += pattern.approvedCount;
    deniedCount += pattern.deniedCount;
    usedCount += pattern.usedCount;
    pendingCount += pattern.pendingCount;
    approvalRequiredLogCount += pattern.approvalRequiredLogCount;
    for (const resource of pattern.resources) resources.add(resource);
    for (const id of pattern.sampleApprovalIds) {
      if (sampleApprovalIds.length < 8) sampleApprovalIds.push(id);
    }
    if (pattern.firstSeenAt && (!firstSeenAt || pattern.firstSeenAt < firstSeenAt)) {
      firstSeenAt = pattern.firstSeenAt;
    }
    if (pattern.lastSeenAt && (!lastSeenAt || pattern.lastSeenAt > lastSeenAt)) {
      lastSeenAt = pattern.lastSeenAt;
    }
  }

  return {
    approvedCount,
    deniedCount,
    usedCount,
    pendingCount,
    approvalRequiredLogCount,
    distinctAgents: 1,
    distinctResources: Math.max(1, resources.size),
    sameAgent: true,
    sameResource: resources.size <= 1,
    historyDays: historyDays(firstSeenAt, lastSeenAt),
    firstSeenAt: firstSeenAt?.toISOString() ?? null,
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
    sampleApprovalIds
  };
}

function scoreTrustProfile(
  template: TrustProfileTemplate,
  matchedPatterns: ApprovalPatternAggregate[],
  coveragePercent: number
): { confidence: number; factors: ConfidenceFactor[] } {
  const factors: ConfidenceFactor[] = [];
  let score = 0;

  const coverageBonus = Math.round(coveragePercent * 0.4);
  factors.push({
    code: "profile_coverage",
    label: `Matched ${coveragePercent}% of ${template.name} actions`,
    delta: coverageBonus,
    polarity: "positive"
  });
  score += coverageBonus;

  const totalApproved = matchedPatterns.reduce((sum, pattern) => sum + pattern.approvedCount, 0);
  const approvalVolume = Math.min(30, totalApproved);
  if (approvalVolume > 0) {
    factors.push({
      code: "bundle_approvals",
      label: `${totalApproved} approvals across matched profile actions`,
      delta: approvalVolume,
      polarity: "positive"
    });
    score += approvalVolume;
  }

  const totalDenied = matchedPatterns.reduce((sum, pattern) => sum + pattern.deniedCount, 0);
  if (totalDenied === 0 && totalApproved >= 5) {
    factors.push({
      code: "zero_denials",
      label: "Zero denials across matched profile actions",
      delta: 15,
      polarity: "positive"
    });
    score += 15;
  }

  const perAction = matchedPatterns.map((pattern) => calculateConfidence(pattern).confidence);
  const avgActionConfidence =
    perAction.length > 0 ? Math.round(perAction.reduce((a, b) => a + b, 0) / perAction.length) : 0;
  const avgBonus = Math.round(avgActionConfidence * 0.15);
  if (avgBonus > 0) {
    factors.push({
      code: "avg_action_confidence",
      label: `Average matched-action confidence ${avgActionConfidence}%`,
      delta: avgBonus,
      polarity: "positive"
    });
    score += avgBonus;
  }

  if (matchedPatterns.length >= 3) {
    factors.push({
      code: "role_coherence",
      label: `${matchedPatterns.length} distinct actions align with ${template.name}`,
      delta: 10,
      polarity: "positive"
    });
    score += 10;
  }

  if (totalDenied > 0) {
    const denialPenalty = Math.min(35, totalDenied * 12);
    factors.push({
      code: "previous_denials",
      label: `${totalDenied} denial${totalDenied === 1 ? "" : "s"} within matched actions`,
      delta: -denialPenalty,
      polarity: "negative"
    });
    score -= denialPenalty;
  }

  const authority = trustProfileAuthorityLevel(template);
  if (authority >= 80) {
    factors.push({
      code: "elevated_profile",
      label: "Profile includes elevated-authority permissions",
      delta: -15,
      polarity: "negative"
    });
    score -= 15;
  }

  return { confidence: clamp(Math.round(score), 0, 100), factors };
}

/**
 * Match agent approval patterns against trust profile templates.
 * Fail closed: high denial rates or thin coverage never produce a match.
 */
export function matchTrustProfiles(options: {
  accountId: string;
  agentId: string;
  patterns: ApprovalPatternAggregate[];
  thresholds: AdaptiveDelegationThresholds;
}): TrustProfileMatch[] {
  const agentPatterns = options.patterns.filter(
    (pattern) =>
      pattern.accountId === options.accountId &&
      pattern.agentId === options.agentId &&
      pattern.approvedCount >= options.thresholds.minApprovals
  );
  if (agentPatterns.length === 0) return [];

  const matches: TrustProfileMatch[] = [];

  for (const template of TRUST_PROFILE_TEMPLATES) {
    const matchedPatterns: ApprovalPatternAggregate[] = [];
    const matchedActions = new Set<string>();
    const unmatchedActions: string[] = [];

    for (const slot of template.permissions) {
      const pattern = agentPatterns.find((candidate) =>
        actionMatchesProfileSlot(candidate.action, slot)
      );
      if (pattern) {
        matchedPatterns.push(pattern);
        matchedActions.add(slot.action);
      } else {
        unmatchedActions.push(slot.action);
      }
    }

    const coveragePercent = Math.round(
      (matchedPatterns.length / template.permissions.length) * 100
    );
    const coverageRatio = matchedPatterns.length / template.permissions.length;

    if (matchedPatterns.length < options.thresholds.minProfileMatchedActions) continue;
    if (coverageRatio < options.thresholds.minProfileCoverage) continue;

    const totalApproved = matchedPatterns.reduce((sum, p) => sum + p.approvedCount, 0);
    const totalDenied = matchedPatterns.reduce((sum, p) => sum + p.deniedCount, 0);
    const resolved = totalApproved + totalDenied;
    if (resolved > 0 && totalDenied / resolved > 0.2) continue;

    const { confidence, factors } = scoreTrustProfile(template, matchedPatterns, coveragePercent);
    if (confidence < options.thresholds.minConfidence) continue;

    const evidence = aggregateEvidence(matchedPatterns);
    const estimatedApprovalReduction = matchedPatterns.reduce(
      (sum, pattern) => sum + Math.max(pattern.usedCount, pattern.approvedCount),
      0
    );

    const permissions = toProfilePermissionInputs(template).map((permission) => ({
      action: permission.action,
      resource: permission.resource,
      requiresApproval: permission.requiresApproval ?? false,
      blockedActions: permission.blockedActions,
      notes: permission.notes
    }));

    matches.push({
      template,
      agentId: options.agentId,
      accountId: options.accountId,
      matchedPatterns,
      unmatchedActions,
      coveragePercent,
      confidence,
      factors,
      evidence,
      estimatedApprovalReduction,
      proposedTrustProfile: {
        templateId: template.id,
        name: template.name,
        description: template.description,
        resourceScope: template.resourceScope,
        matchedActions: [...matchedActions],
        unmatchedActions,
        coveragePercent,
        permissions
      }
    });
  }

  return matches.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.coveragePercent - a.coveragePercent;
  });
}

export function buildTrustProfileExplanation(match: TrustProfileMatch): string {
  return (
    `This agent’s approval history aligns with the ${match.template.name} trust profile ` +
    `(${match.coveragePercent}% coverage, ${match.confidence}% confidence). ` +
    `Matched actions: ${match.proposedTrustProfile.matchedActions.join(", ") || "none"}. ` +
    `Would you like to create and apply this reusable authority bundle? ` +
    `Elevated actions in the profile keep their approval policies.`
  );
}
