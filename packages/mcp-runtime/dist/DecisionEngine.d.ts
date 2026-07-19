import type { AggregatedPolicyResult } from "./PolicyEngine.js";
import type { ApprovalRequest, RiskAssessment, RuntimeDecision } from "./types.js";
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
export declare class DecisionEngine {
    decide(input: DecisionInput): RuntimeDecision;
    private build;
}
