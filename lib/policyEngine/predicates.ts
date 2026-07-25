import type {
  PolicyCiStatus,
  PolicyFacts,
  PolicyPredicate,
  PolicyRiskLevel
} from "@/lib/policyEngine/types";

/**
 * Glob matcher aligned with lib/verify.ts path constraint semantics:
 * `*` = one path segment, `**` = any depth.
 */
export function pathGlobMatch(pattern: string, value: string): boolean {
  let reStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      i += 2;
      if (i < pattern.length && pattern[i] === "/") {
        reStr += "(?:.*\\/)?";
        i++;
      } else {
        reStr += ".*";
      }
    } else if (ch === "*") {
      reStr += "[^/]*";
      i++;
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      reStr += "\\" + ch;
      i++;
    } else {
      reStr += ch;
      i++;
    }
  }
  return new RegExp("^" + reStr + "$").test(value);
}

const RISK_RANK: Record<PolicyRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3
};

export function isPolicyCiStatus(value: unknown): value is PolicyCiStatus {
  return value === "success" || value === "failure" || value === "pending" || value === "unknown";
}

export function isPolicyRiskLevel(value: unknown): value is PolicyRiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

/**
 * Evaluate a single predicate against facts. Returns false for unknown types.
 */
export function matchPredicate(predicate: PolicyPredicate, facts: PolicyFacts): boolean {
  switch (predicate.type) {
    case "path_glob":
      return facts.paths.some((path) => pathGlobMatch(predicate.pattern, path));
    case "diff_lines_lt":
      return typeof facts.diff?.linesChanged === "number" && facts.diff.linesChanged < predicate.max;
    case "diff_lines_lte":
      return typeof facts.diff?.linesChanged === "number" && facts.diff.linesChanged <= predicate.max;
    case "ci_status":
      return facts.ci?.status === predicate.status;
    case "risk":
      return facts.risk === predicate.level;
    case "action":
      return facts.action === predicate.action;
    case "vendor":
      return Boolean(facts.vendor) && facts.vendor === predicate.vendor;
    case "permission_requires_approval":
      return facts.permissionRequiresApproval === predicate.value;
    default: {
      const _exhaustive: never = predicate;
      void _exhaustive;
      return false;
    }
  }
}

/** True when facts.risk is at least the given level (low < medium < high). */
export function riskAtLeast(facts: PolicyFacts, level: PolicyRiskLevel): boolean {
  return RISK_RANK[facts.risk] >= RISK_RANK[level];
}
