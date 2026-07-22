export type DecisionOutcome = "allow" | "auto_approve" | "require_human" | "deny";

export type PolicyRiskLevel = "low" | "medium" | "high";

export type PolicyCiStatus = "success" | "failure" | "pending" | "unknown";

export type PolicyDiffFacts = {
  linesChanged: number;
  files: string[];
};

export type PolicyCiFacts = {
  status: PolicyCiStatus;
  checks?: string[];
};

/**
 * Normalized facts available to guardrail predicates. Built from VerifyInput
 * (action, paths, risk) plus optional CI/diff adapters in policyContext/metadata.
 */
export type PolicyFacts = {
  action: string;
  vendor?: string;
  paths: string[];
  command?: string;
  diff?: PolicyDiffFacts;
  ci?: PolicyCiFacts;
  risk: PolicyRiskLevel;
  permissionRequiresApproval: boolean;
  metadata?: Record<string, unknown>;
};

/**
 * Predicate types are AND-composed on a rule's `when` array.
 * Unknown predicate types never match (fail closed for that predicate).
 */
export type PolicyPredicate =
  | { type: "path_glob"; pattern: string }
  | { type: "diff_lines_lt"; max: number }
  | { type: "diff_lines_lte"; max: number }
  | { type: "ci_status"; status: PolicyCiStatus }
  | { type: "risk"; level: PolicyRiskLevel }
  | { type: "action"; action: string }
  | { type: "vendor"; vendor: string }
  | { type: "permission_requires_approval"; value: boolean };

export type PolicyRule = {
  id: string;
  /** Lower priority runs first. Ties keep declaration order. */
  priority: number;
  when: PolicyPredicate[];
  then: DecisionOutcome;
  reason: string;
};

export type PolicyEvaluation = {
  outcome: DecisionOutcome;
  matchedRuleId?: string;
  reason: string;
  facts: PolicyFacts;
};

/**
 * Account-scoped policy document. Persistence/CRUD lands in a later phase;
 * loaders may return null when none is configured (backward-compatible).
 */
export type PolicyDocument = {
  accountId: string;
  version: number;
  enabled: boolean;
  rules: PolicyRule[];
};
