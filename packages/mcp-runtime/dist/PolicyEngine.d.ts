import type { PolicyRegistry } from "./PolicyRegistry.js";
import type { PolicyContext, PolicyResult, PolicyVerdict } from "./types.js";
export type AggregatedPolicyResult = {
    verdict: PolicyVerdict;
    reason: string;
    matchedPolicyId?: string;
    results: PolicyResult[];
};
/**
 * Rule-based Policy Engine.
 *
 * Evaluation:
 * 1. Run every policy in priority order (or stop early on a definitive verdict).
 * 2. Soft aggregation precedence: allow > require-approval > deny > abstain.
 *
 * This lets an explicit allow permission override a soft high-risk approval
 * requirement, while definitive denies (blocked server / deny grants) always win.
 *
 * Policies never execute MCP tools or mutate business data.
 */
export declare class PolicyEngine {
    private readonly registry;
    constructor(registry: PolicyRegistry);
    evaluate(context: PolicyContext): Promise<AggregatedPolicyResult>;
}
