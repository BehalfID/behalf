import { matchPredicate } from "@/lib/policyEngine/predicates";
import type {
  DecisionOutcome,
  PolicyEvaluation,
  PolicyFacts,
  PolicyRule
} from "@/lib/policyEngine/types";

function fallbackOutcome(facts: PolicyFacts): Pick<PolicyEvaluation, "outcome" | "reason"> {
  if (facts.permissionRequiresApproval) {
    return {
      outcome: "require_human",
      reason: "No policy rule matched; permission requires approval."
    };
  }
  return {
    outcome: "allow",
    reason: "No policy rule matched; permission allows action."
  };
}

/**
 * Deterministic ordered evaluation: sort by ascending priority (stable for ties),
 * first rule whose predicates all match wins. Empty `when` matches unconditionally.
 */
export function evaluateGuardrailRules(
  rules: PolicyRule[],
  facts: PolicyFacts
): PolicyEvaluation {
  const indexed = rules.map((rule, index) => ({ rule, index }));
  indexed.sort((a, b) => {
    if (a.rule.priority !== b.rule.priority) {
      return a.rule.priority - b.rule.priority;
    }
    return a.index - b.index;
  });

  for (const { rule } of indexed) {
    const predicates = rule.when ?? [];
    const matched = predicates.every((predicate) => matchPredicate(predicate, facts));
    if (!matched) continue;

    const outcome: DecisionOutcome = rule.then;
    return {
      outcome,
      matchedRuleId: rule.id,
      reason: rule.reason,
      facts
    };
  }

  const fallback = fallbackOutcome(facts);
  return {
    outcome: fallback.outcome,
    reason: fallback.reason,
    facts
  };
}
