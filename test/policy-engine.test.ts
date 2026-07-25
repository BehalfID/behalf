import { describe, expect, it } from "vitest";
import { evaluateGuardrailRules } from "@/lib/policyEngine/evaluate";
import { matchPredicate, pathGlobMatch } from "@/lib/policyEngine/predicates";
import type { PolicyFacts, PolicyRule } from "@/lib/policyEngine/types";

function baseFacts(overrides: Partial<PolicyFacts> = {}): PolicyFacts {
  return {
    action: "write_file",
    paths: ["src/app.ts"],
    risk: "medium",
    permissionRequiresApproval: true,
    ...overrides
  };
}

describe("pathGlobMatch", () => {
  it("matches ** and single-segment globs like verify path constraints", () => {
    expect(pathGlobMatch("**/auth/**", "lib/auth/session.ts")).toBe(true);
    expect(pathGlobMatch("src/*.ts", "src/app.ts")).toBe(true);
    expect(pathGlobMatch("src/*.ts", "src/nested/app.ts")).toBe(false);
  });
});

describe("matchPredicate", () => {
  it("evaluates path, diff, ci, risk, and approval predicates", () => {
    const facts = baseFacts({
      paths: ["lib/auth/login.ts"],
      diff: { linesChanged: 4, files: ["lib/auth/login.ts"] },
      ci: { status: "success" },
      risk: "low"
    });

    expect(matchPredicate({ type: "path_glob", pattern: "**/auth/**" }, facts)).toBe(true);
    expect(matchPredicate({ type: "diff_lines_lt", max: 10 }, facts)).toBe(true);
    expect(matchPredicate({ type: "diff_lines_lte", max: 4 }, facts)).toBe(true);
    expect(matchPredicate({ type: "ci_status", status: "success" }, facts)).toBe(true);
    expect(matchPredicate({ type: "risk", level: "low" }, facts)).toBe(true);
    expect(matchPredicate({ type: "permission_requires_approval", value: true }, facts)).toBe(true);
    expect(matchPredicate({ type: "diff_lines_lt", max: 3 }, facts)).toBe(false);
  });
});

describe("evaluateGuardrailRules", () => {
  it("returns allow when a matching rule decides allow", () => {
    const rules: PolicyRule[] = [
      {
        id: "allow-docs",
        priority: 10,
        when: [{ type: "path_glob", pattern: "docs/**" }],
        then: "allow",
        reason: "Documentation edits are allowed."
      }
    ];

    const evaluation = evaluateGuardrailRules(
      rules,
      baseFacts({ paths: ["docs/README.md"] })
    );

    expect(evaluation).toEqual(
      expect.objectContaining({
        outcome: "allow",
        matchedRuleId: "allow-docs",
        reason: "Documentation edits are allowed."
      })
    );
  });

  it("returns auto_approve for small diffs with green CI", () => {
    const rules: PolicyRule[] = [
      {
        id: "force-auth-pause",
        priority: 1,
        when: [{ type: "path_glob", pattern: "**/auth/**" }],
        then: "require_human",
        reason: "Auth paths always need a human."
      },
      {
        id: "small-diff-auto",
        priority: 20,
        when: [
          { type: "diff_lines_lt", max: 10 },
          { type: "ci_status", status: "success" },
          { type: "action", action: "write_file" }
        ],
        then: "auto_approve",
        reason: "Small diff with passing CI."
      }
    ];

    const evaluation = evaluateGuardrailRules(
      rules,
      baseFacts({
        paths: ["src/utils.ts"],
        diff: { linesChanged: 3, files: ["src/utils.ts"] },
        ci: { status: "success" }
      })
    );

    expect(evaluation.outcome).toBe("auto_approve");
    expect(evaluation.matchedRuleId).toBe("small-diff-auto");
  });

  it("returns deny when a matching rule denies", () => {
    const rules: PolicyRule[] = [
      {
        id: "deny-prod-deploy",
        priority: 5,
        when: [
          { type: "action", action: "deploy" },
          { type: "vendor", vendor: "production" }
        ],
        then: "deny",
        reason: "Production deploys are blocked by policy."
      }
    ];

    const evaluation = evaluateGuardrailRules(
      rules,
      baseFacts({
        action: "deploy",
        vendor: "production",
        paths: [],
        permissionRequiresApproval: false
      })
    );

    expect(evaluation).toEqual(
      expect.objectContaining({
        outcome: "deny",
        matchedRuleId: "deny-prod-deploy",
        reason: "Production deploys are blocked by policy."
      })
    );
  });

  it("falls back to require_human when no rule matches and approval is required", () => {
    const rules: PolicyRule[] = [
      {
        id: "only-docs",
        priority: 10,
        when: [{ type: "path_glob", pattern: "docs/**" }],
        then: "allow",
        reason: "docs only"
      }
    ];

    const evaluation = evaluateGuardrailRules(
      rules,
      baseFacts({ paths: ["src/secret.ts"], permissionRequiresApproval: true })
    );

    expect(evaluation.outcome).toBe("require_human");
    expect(evaluation.reason).toBe("No policy rule matched; permission requires approval.");
    expect(evaluation.matchedRuleId).toBeUndefined();
  });

  it("falls back to allow when no rule matches and approval is not required", () => {
    const evaluation = evaluateGuardrailRules(
      [],
      baseFacts({ permissionRequiresApproval: false })
    );

    expect(evaluation.outcome).toBe("allow");
    expect(evaluation.reason).toBe("No policy rule matched; permission allows action.");
  });

  it("prefers lower priority numbers and keeps declaration order on ties", () => {
    const rules: PolicyRule[] = [
      {
        id: "second-tie",
        priority: 10,
        when: [],
        then: "deny",
        reason: "second"
      },
      {
        id: "first-tie",
        priority: 10,
        when: [],
        then: "auto_approve",
        reason: "first declared at same priority"
      },
      {
        id: "high-priority",
        priority: 1,
        when: [{ type: "path_glob", pattern: "**/auth/**" }],
        then: "require_human",
        reason: "auth pause"
      }
    ];

    const authEval = evaluateGuardrailRules(
      rules,
      baseFacts({ paths: ["lib/auth/x.ts"] })
    );
    expect(authEval.matchedRuleId).toBe("high-priority");
    expect(authEval.outcome).toBe("require_human");

    const tieEval = evaluateGuardrailRules(rules, baseFacts({ paths: ["other.ts"] }));
    expect(tieEval.matchedRuleId).toBe("second-tie");
    expect(tieEval.outcome).toBe("deny");
  });

  it("treats empty when[] as unconditional match", () => {
    const rules: PolicyRule[] = [
      {
        id: "catch-all-human",
        priority: 100,
        when: [],
        then: "require_human",
        reason: "Default human gate."
      }
    ];

    const evaluation = evaluateGuardrailRules(
      rules,
      baseFacts({ permissionRequiresApproval: false })
    );

    expect(evaluation.outcome).toBe("require_human");
    expect(evaluation.matchedRuleId).toBe("catch-all-human");
  });
});
