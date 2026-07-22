import { AUTHORITY_LEVELS } from "@/lib/authority";
import { classifyPermissionRisk } from "@/lib/permissionRisk";
import type {
  ApprovalPatternAggregate,
  ConfidenceFactor,
  RecommendationEvidence
} from "@/lib/adaptiveDelegation/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function historyDays(first: Date | null, last: Date | null): number {
  if (!first || !last) return 0;
  const ms = Math.max(0, last.getTime() - first.getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function isProductionResource(resource: string | null): boolean {
  if (!resource) return false;
  const value = resource.toLowerCase();
  return (
    value.includes("production") ||
    value.includes("prod") ||
    value.includes("live") ||
    /(^|[/_-])main($|[/_-])/.test(value) ||
    /(^|[/_-])master($|[/_-])/.test(value)
  );
}

/**
 * Deterministic confidence score (0–100). Advisory only — never fed into
 * verifyAction() or any authorization decision.
 */
export function calculateConfidence(pattern: ApprovalPatternAggregate): {
  confidence: number;
  factors: ConfidenceFactor[];
} {
  const factors: ConfidenceFactor[] = [];
  let score = 0;

  const approvalVolume = Math.min(40, pattern.approvedCount * 2);
  if (approvalVolume > 0) {
    factors.push({
      code: "repeated_approvals",
      label: `Approved ${pattern.approvedCount} time${pattern.approvedCount === 1 ? "" : "s"}`,
      delta: approvalVolume,
      polarity: "positive"
    });
    score += approvalVolume;
  }

  if (pattern.deniedCount === 0 && pattern.approvedCount >= 5) {
    factors.push({
      code: "zero_denials",
      label: "Zero denials in observed history",
      delta: 20,
      polarity: "positive"
    });
    score += 20;
  }

  // Patterns are scoped to a single agentId by construction.
  factors.push({
    code: "same_agent",
    label: "Consistent agent identity",
    delta: 10,
    polarity: "positive"
  });
  score += 10;

  const distinctResources = pattern.resources.length;
  if (distinctResources <= 1 && pattern.approvedCount >= 3) {
    factors.push({
      code: "same_resource",
      label: pattern.resource
        ? `Same resource (${pattern.resource})`
        : "No resource variance observed",
      delta: 10,
      polarity: "positive"
    });
    score += 10;
  }

  const days = historyDays(pattern.firstSeenAt, pattern.lastSeenAt);
  if (days >= 7) {
    factors.push({
      code: "long_history",
      label: `History spans ${days} day${days === 1 ? "" : "s"}`,
      delta: 10,
      polarity: "positive"
    });
    score += 10;
  }

  const classification = classifyPermissionRisk({
    action: pattern.action,
    resource: pattern.resource
  });

  if (
    classification.classified &&
    classification.requiredAuthorityLevel <= AUTHORITY_LEVELS.ENGINEER
  ) {
    factors.push({
      code: "low_risk_operation",
      label: "Classified as lower-risk engineer-scoped operation",
      delta: 10,
      polarity: "positive"
    });
    score += 10;
  }

  if (pattern.deniedCount > 0) {
    const denialPenalty = Math.min(40, pattern.deniedCount * 15);
    factors.push({
      code: "previous_denials",
      label: `Denied ${pattern.deniedCount} time${pattern.deniedCount === 1 ? "" : "s"}`,
      delta: -denialPenalty,
      polarity: "negative"
    });
    score -= denialPenalty;
  }

  const resolved = pattern.approvedCount + pattern.deniedCount;
  if (resolved > 0) {
    const denialRate = pattern.deniedCount / resolved;
    if (denialRate > 0.05) {
      factors.push({
        code: "inconsistent_history",
        label: `Inconsistent approvals (${Math.round(denialRate * 100)}% denied)`,
        delta: -10,
        polarity: "negative"
      });
      score -= 10;
    }
  }

  if (classification.requiredAuthorityLevel >= AUTHORITY_LEVELS.ENGINEERING_LEAD) {
    factors.push({
      code: "elevated_permissions",
      label: "Elevated authority operation",
      delta: -20,
      polarity: "negative"
    });
    score -= 20;
  } else if (classification.requiredAuthorityLevel >= AUTHORITY_LEVELS.SENIOR_ENGINEER) {
    factors.push({
      code: "destructive_or_sensitive",
      label: "Sensitive or potentially destructive operation",
      delta: -25,
      polarity: "negative"
    });
    score -= 25;
  }

  if (isProductionResource(pattern.resource)) {
    factors.push({
      code: "production_resource",
      label: "Touches a production or protected resource",
      delta: -15,
      polarity: "negative"
    });
    score -= 15;
  }

  return {
    confidence: clamp(Math.round(score), 0, 100),
    factors
  };
}

export function buildEvidence(pattern: ApprovalPatternAggregate): RecommendationEvidence {
  return {
    approvedCount: pattern.approvedCount,
    deniedCount: pattern.deniedCount,
    usedCount: pattern.usedCount,
    pendingCount: pattern.pendingCount,
    approvalRequiredLogCount: pattern.approvalRequiredLogCount,
    distinctAgents: 1,
    distinctResources: Math.max(1, pattern.resources.length),
    sameAgent: true,
    sameResource: pattern.resources.length <= 1,
    historyDays: historyDays(pattern.firstSeenAt, pattern.lastSeenAt),
    firstSeenAt: pattern.firstSeenAt?.toISOString() ?? null,
    lastSeenAt: pattern.lastSeenAt?.toISOString() ?? null,
    sampleApprovalIds: pattern.sampleApprovalIds.slice(0, 8)
  };
}

export function buildExplanation(
  pattern: ApprovalPatternAggregate,
  confidence: number
): string {
  const resourcePart = pattern.resource
    ? ` for resource "${pattern.resource}"`
    : "";
  const denialPart =
    pattern.deniedCount === 0
      ? "with no denials"
      : `with ${pattern.deniedCount} denial${pattern.deniedCount === 1 ? "" : "s"}`;

  return (
    `You have approved "${pattern.action}"${resourcePart} ` +
    `${pattern.approvedCount} time${pattern.approvedCount === 1 ? "" : "s"} ${denialPart}. ` +
    `Confidence ${confidence}%. Would you like to create a reusable permission so future ` +
    `matching verify() calls do not require repeated approval?`
  );
}
