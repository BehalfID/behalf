import type {
  AdaptiveDelegationThresholds,
  ApprovalPatternAggregate,
  ConfidenceFactor,
  ProposedOrgDelegation,
  RecommendationEvidence
} from "@/lib/adaptiveDelegation/types";
import {
  ORG_DELEGATION_TEMPLATES,
  actionMatchesProfileSlot,
  orgTemplateAuthorityLevel,
  orgTemplateMatchSlots,
  toOrgProfilePermissionInputs,
  type OrgDelegationTemplate
} from "@/lib/adaptiveDelegation/orgTemplates";

export type OrgDelegationMatch = {
  template: OrgDelegationTemplate;
  accountId: string;
  agentIds: string[];
  matchedActions: string[];
  unmatchedActions: string[];
  coveragePercent: number;
  confidence: number;
  factors: ConfidenceFactor[];
  evidence: RecommendationEvidence;
  estimatedApprovalReduction: number;
  proposedOrgDelegation: ProposedOrgDelegation;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scoreOrgMatch(options: {
  template: OrgDelegationTemplate;
  agentIds: string[];
  coveragePercent: number;
  totalApproved: number;
  totalDenied: number;
  matchedActionCount: number;
}): { confidence: number; factors: ConfidenceFactor[] } {
  const factors: ConfidenceFactor[] = [];
  let score = 0;

  const agentBonus = Math.min(30, options.agentIds.length * 12);
  factors.push({
    code: "multi_agent_coverage",
    label: `${options.agentIds.length} agents share ${options.template.name} approval patterns`,
    delta: agentBonus,
    polarity: "positive"
  });
  score += agentBonus;

  const coverageBonus = Math.round(options.coveragePercent * 0.35);
  factors.push({
    code: "org_template_coverage",
    label: `Matched ${options.coveragePercent}% of ${options.template.department} template actions`,
    delta: coverageBonus,
    polarity: "positive"
  });
  score += coverageBonus;

  const volume = Math.min(25, options.totalApproved);
  if (volume > 0) {
    factors.push({
      code: "org_approval_volume",
      label: `${options.totalApproved} approvals across matched org actions`,
      delta: volume,
      polarity: "positive"
    });
    score += volume;
  }

  if (options.totalDenied === 0 && options.totalApproved >= 10) {
    factors.push({
      code: "zero_denials",
      label: "Zero denials across matched org actions",
      delta: 15,
      polarity: "positive"
    });
    score += 15;
  }

  if (options.matchedActionCount >= 3) {
    factors.push({
      code: "org_role_coherence",
      label: `${options.matchedActionCount} actions align with ${options.template.name}`,
      delta: 10,
      polarity: "positive"
    });
    score += 10;
  }

  if (options.totalDenied > 0) {
    const penalty = Math.min(35, options.totalDenied * 10);
    factors.push({
      code: "previous_denials",
      label: `${options.totalDenied} denial(s) within matched org actions`,
      delta: -penalty,
      polarity: "negative"
    });
    score -= penalty;
  }

  const authority = orgTemplateAuthorityLevel(options.template);
  if (authority >= 100) {
    factors.push({
      code: "owner_gated_org_template",
      label: "Security-sensitive org template requires Owner confirmation",
      delta: -5,
      polarity: "negative"
    });
    score -= 5;
  }

  return { confidence: clamp(Math.round(score), 0, 100), factors };
}

/**
 * Match cross-agent approval patterns to organization delegation templates.
 * Requires multiple agents and fail-closed denial / coverage thresholds.
 */
export function matchOrgDelegationTemplates(options: {
  accountId: string;
  patterns: ApprovalPatternAggregate[];
  thresholds: AdaptiveDelegationThresholds;
  agentNames?: Map<string, string>;
}): OrgDelegationMatch[] {
  const accountPatterns = options.patterns.filter(
    (pattern) =>
      pattern.accountId === options.accountId &&
      pattern.approvedCount >= options.thresholds.minApprovals
  );
  if (accountPatterns.length === 0) return [];

  const matches: OrgDelegationMatch[] = [];

  for (const template of ORG_DELEGATION_TEMPLATES) {
    const slots = orgTemplateMatchSlots(template);
    const matchedActions: string[] = [];
    const unmatchedActions: string[] = [];
    const agentIds = new Set<string>();
    const matchedPatterns: ApprovalPatternAggregate[] = [];

    for (const slot of slots) {
      const slotPatterns = accountPatterns.filter((pattern) =>
        actionMatchesProfileSlot(pattern.action, slot)
      );
      if (slotPatterns.length === 0) {
        unmatchedActions.push(slot.action);
        continue;
      }
      matchedActions.push(slot.action);
      for (const pattern of slotPatterns) {
        matchedPatterns.push(pattern);
        agentIds.add(pattern.agentId);
      }
    }

    if (agentIds.size < options.thresholds.minOrgAgents) continue;

    const coveragePercent = Math.round((matchedActions.length / slots.length) * 100);
    const coverageRatio = matchedActions.length / slots.length;
    if (matchedActions.length < options.thresholds.minProfileMatchedActions) continue;
    if (coverageRatio < options.thresholds.minProfileCoverage) continue;

    const totalApproved = matchedPatterns.reduce((sum, pattern) => sum + pattern.approvedCount, 0);
    const totalDenied = matchedPatterns.reduce((sum, pattern) => sum + pattern.deniedCount, 0);
    const totalUsed = matchedPatterns.reduce((sum, pattern) => sum + pattern.usedCount, 0);
    const resolved = totalApproved + totalDenied;
    if (resolved > 0 && totalDenied / resolved > 0.2) continue;

    const { confidence, factors } = scoreOrgMatch({
      template,
      agentIds: [...agentIds],
      coveragePercent,
      totalApproved,
      totalDenied,
      matchedActionCount: matchedActions.length
    });
    if (confidence < options.thresholds.minConfidence) continue;

    const firstSeenAt = matchedPatterns
      .map((pattern) => pattern.firstSeenAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const lastSeenAt = matchedPatterns
      .map((pattern) => pattern.lastSeenAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const sortedAgentIds = [...agentIds].sort();
    const permissions = toOrgProfilePermissionInputs(template).map((permission) => ({
      action: permission.action,
      resource: permission.resource,
      requiresApproval: permission.requiresApproval ?? false,
      blockedActions: permission.blockedActions,
      notes: permission.notes
    }));

    matches.push({
      template,
      accountId: options.accountId,
      agentIds: sortedAgentIds,
      matchedActions,
      unmatchedActions,
      coveragePercent,
      confidence,
      factors,
      evidence: {
        approvedCount: totalApproved,
        deniedCount: totalDenied,
        usedCount: totalUsed,
        pendingCount: 0,
        approvalRequiredLogCount: 0,
        distinctAgents: sortedAgentIds.length,
        distinctResources: new Set(
          matchedPatterns.flatMap((pattern) => pattern.resources)
        ).size || 1,
        sameAgent: false,
        sameResource: false,
        historyDays:
          firstSeenAt && lastSeenAt
            ? Math.floor(Math.max(0, lastSeenAt.getTime() - firstSeenAt.getTime()) / (24 * 60 * 60 * 1000))
            : 0,
        firstSeenAt: firstSeenAt?.toISOString() ?? null,
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
        sampleApprovalIds: matchedPatterns.flatMap((pattern) => pattern.sampleApprovalIds).slice(0, 8)
      },
      estimatedApprovalReduction: Math.max(totalUsed, totalApproved),
      proposedOrgDelegation: {
        templateId: template.id,
        name: template.name,
        description: template.description,
        department: template.department,
        minAcceptAuthorityLevel: template.minAcceptAuthorityLevel,
        agentIds: sortedAgentIds,
        agentLabels: sortedAgentIds.map(
          (agentId) => options.agentNames?.get(agentId) ?? agentId
        ),
        matchedActions,
        unmatchedActions,
        coveragePercent,
        permissions
      }
    });
  }

  return matches.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.agentIds.length - a.agentIds.length;
  });
}

export function buildOrgDelegationExplanation(match: OrgDelegationMatch): string {
  return (
    `${match.agentIds.length} agents in this workspace show approval history aligned with the ` +
    `${match.template.name} organization template (${match.coveragePercent}% coverage, ` +
    `${match.confidence}% confidence). Matched actions: ${match.matchedActions.join(", ") || "none"}. ` +
    `Would you like to create an account-scoped PermissionProfile and apply it to selected agents? ` +
    `Organization policies and verify() remain the governing authority — nothing is applied without confirmation.`
  );
}
