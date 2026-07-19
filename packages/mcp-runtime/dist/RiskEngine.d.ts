import type { ExecutionContext, RiskAssessment, RiskScorer } from "./types.js";
/**
 * Default heuristic risk scorer — extensible via additional {@link RiskScorer}s.
 */
export declare class HeuristicRiskScorer implements RiskScorer {
    readonly id = "heuristic";
    assess(context: ExecutionContext, permission?: string): RiskAssessment;
}
/**
 * Risk Engine — aggregates scorers (max level / max score wins).
 * Extension point for future ML-based scorers.
 */
export declare class RiskEngine {
    private readonly scorers;
    constructor(scorers?: RiskScorer[]);
    register(scorer: RiskScorer): this;
    assess(context: ExecutionContext, permission?: string): RiskAssessment;
}
