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
export class PolicyEngine {
  constructor(private readonly registry: PolicyRegistry) {}

  async evaluate(context: PolicyContext): Promise<AggregatedPolicyResult> {
    const results: PolicyResult[] = [];

    for (const policy of this.registry.list()) {
      const result = await policy.evaluate(context);
      results.push(result);

      if (result.definitive && result.verdict !== "abstain") {
        return {
          verdict: result.verdict,
          reason: result.reason,
          matchedPolicyId: result.policyId,
          results,
        };
      }
    }

    return aggregateSoft(results);
  }
}

function aggregateSoft(results: PolicyResult[]): AggregatedPolicyResult {
  const pick = (verdict: PolicyVerdict): PolicyResult | undefined =>
    results.find((r) => r.verdict === verdict);

  const allow = pick("allow");
  if (allow) {
    return {
      verdict: "allow",
      reason: allow.reason,
      matchedPolicyId: allow.policyId,
      results,
    };
  }

  const approval = pick("require-approval");
  if (approval) {
    return {
      verdict: "require-approval",
      reason: approval.reason,
      matchedPolicyId: approval.policyId,
      results,
    };
  }

  const deny = pick("deny");
  if (deny) {
    return {
      verdict: "deny",
      reason: deny.reason,
      matchedPolicyId: deny.policyId,
      results,
    };
  }

  return {
    verdict: "abstain",
    reason: "No policy produced a decision",
    results,
  };
}
