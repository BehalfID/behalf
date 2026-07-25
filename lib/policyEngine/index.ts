export { evaluateGuardrailRules } from "@/lib/policyEngine/evaluate";
export { buildPolicyFacts } from "@/lib/policyEngine/facts";
export {
  clearPolicyDocumentCache,
  invalidatePolicyDocumentCache,
  loadPolicyDocument
} from "@/lib/policyEngine/loadPolicy";
export {
  isPolicyCiStatus,
  isPolicyRiskLevel,
  matchPredicate,
  pathGlobMatch,
  riskAtLeast
} from "@/lib/policyEngine/predicates";
export type {
  DecisionOutcome,
  PolicyCiFacts,
  PolicyCiStatus,
  PolicyDiffFacts,
  PolicyDocument,
  PolicyEvaluation,
  PolicyFacts,
  PolicyPredicate,
  PolicyRiskLevel,
  PolicyRule
} from "@/lib/policyEngine/types";
