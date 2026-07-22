import { describe, expect, it } from "vitest";
import {
  parsePolicyFileContents,
  validatePolicyDocumentShape
} from "../packages/cli/src/lib/policyFile";

describe("CLI policy file parsing", () => {
  it("parses JSON policy documents", () => {
    const parsed = parsePolicyFileContents(
      JSON.stringify({
        enabled: true,
        rules: [
          {
            id: "small-diff",
            priority: 10,
            when: [
              { type: "diff_lines_lt", max: 10 },
              { type: "ci_status", status: "success" }
            ],
            then: "auto_approve",
            reason: "small green diff"
          }
        ]
      })
    );

    const validated = validatePolicyDocumentShape(parsed);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.document.rules).toHaveLength(1);
    }
  });

  it("parses a minimal YAML policy document", () => {
    const yaml = `
enabled: true
rules:
  - id: auth-pause
    priority: 1
    when:
      - type: path_glob
        pattern: "**/auth/**"
    then: require_human
    reason: Auth paths need a human
`;
    const parsed = parsePolicyFileContents(yaml, "policy.yaml");
    const validated = validatePolicyDocumentShape(parsed);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.document.rules[0]).toEqual(
        expect.objectContaining({
          id: "auth-pause",
          then: "require_human"
        })
      );
    }
  });
});
