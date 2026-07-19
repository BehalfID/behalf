import type {
  AggregatedPolicyResult,
} from "./PolicyEngine.js";
import type {
  ApprovalRequest,
  DecisionType,
  RiskAssessment,
  RuntimeDecision,
} from "./types.js";

export type DecisionInput = {
  requestId: string;
  policy: AggregatedPolicyResult;
  risk: RiskAssessment;
  approval?: ApprovalRequest;
  /** When true, allow decisions are upgraded to allow-with-audit. */
  forceAudit?: boolean;
  /** Server-level block from policy. */
  blockServer?: boolean;
  evaluatedAt?: string;
};

/**
 * Decision Engine — single place that maps policy + risk + approval
 * into a final {@link RuntimeDecision}. No module may bypass this.
 */
export class DecisionEngine {
  decide(input: DecisionInput): RuntimeDecision {
    const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();

    if (input.blockServer || input.policy.verdict === "deny") {
      return this.build(
        "deny",
        input,
        input.policy.reason || "Denied by policy",
        evaluatedAt
      );
    }

    if (input.approval) {
      if (input.approval.status === "denied") {
        return this.build(
          "deny",
          input,
          "Denied by user approval decision",
          evaluatedAt,
          input.approval.id
        );
      }
      if (
        input.approval.status === "approved-once" ||
        input.approval.status === "always-allowed"
      ) {
        const type: DecisionType = input.forceAudit ? "allow-with-audit" : "allow";
        return this.build(
          type,
          input,
          `Approved by user (${input.approval.choice})`,
          evaluatedAt,
          input.approval.id
        );
      }
      if (input.approval.status === "pending") {
        return this.build(
          "require-approval",
          input,
          input.policy.reason || "Approval required",
          evaluatedAt,
          input.approval.id
        );
      }
    }

    if (input.policy.verdict === "require-approval") {
      return this.build(
        "require-approval",
        input,
        input.policy.reason,
        evaluatedAt,
        input.approval?.id
      );
    }

    if (input.policy.verdict === "allow") {
      const type: DecisionType =
        input.forceAudit || input.risk.level === "high" || input.risk.level === "critical"
          ? "allow-with-audit"
          : "allow";
      return this.build(type, input, input.policy.reason, evaluatedAt);
    }

    // abstain → fail closed
    return this.build(
      "deny",
      input,
      "Denied: no policy allowed this action (fail-closed)",
      evaluatedAt
    );
  }

  private build(
    type: DecisionType,
    input: DecisionInput,
    reason: string,
    evaluatedAt: string,
    approvalId?: string
  ): RuntimeDecision {
    // Map block-server when explicitly requested
    const finalType: DecisionType =
      input.blockServer && type === "deny" ? "block-server" : type;

    return {
      type: finalType,
      requestId: input.requestId,
      reason,
      risk: input.risk.level,
      riskScore: input.risk.score,
      policyMatched: input.policy.matchedPolicyId,
      approvalId,
      allowed: finalType === "allow" || finalType === "allow-with-audit",
      evaluatedAt,
    };
  }
}
