import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
import { createFinding } from "../utils/finding.js";

/**
 * Detects configured policies that are never applied to any server.
 *
 * Category: unenforced-policy
 */
export class UnenforcedPolicyRule implements AuditRule {
  readonly id = "unenforced-policy";
  readonly name = "Unenforced Policy";

  async execute(context: AuditContext): Promise<McpAuditFinding[]> {
    const { configuration } = context;
    const policies = configuration.policies ?? [];
    if (policies.length === 0) return [];

    const applied = new Set<string>();
    for (const server of configuration.servers) {
      for (const id of server.appliedPolicyIds ?? []) {
        applied.add(id);
      }
    }

    const findings: McpAuditFinding[] = [];

    for (const policy of policies) {
      const explicitlyUnenforced = policy.enforced === false;
      const neverApplied = !applied.has(policy.id);
      const targets = policy.appliesToServers ?? [];
      const targetMissing =
        targets.length > 0 &&
        targets.every(
          (name) =>
            !configuration.servers.some(
              (s) => s.name.toLowerCase() === name.toLowerCase()
            )
        );

      if (!explicitlyUnenforced && !neverApplied && !targetMissing) {
        continue;
      }

      const reasons: string[] = [];
      if (explicitlyUnenforced) reasons.push("policy.enforced=false");
      if (neverApplied) reasons.push("policy id not present in any server.appliedPolicyIds");
      if (targetMissing) {
        reasons.push(
          `appliesToServers=[${targets.join(", ")}] — no matching configured servers`
        );
      }

      findings.push(
        createFinding({
          ruleId: this.id,
          category: "unenforced-policy",
          severity: "medium",
          title: `Unenforced policy: ${policy.name}`,
          description:
            `Policy "${policy.name}" (${policy.id}) is configured but not applied.`,
          evidence: [
            `policy.id=${policy.id}`,
            `policy.name=${policy.name}`,
            ...reasons,
          ],
          remediation:
            "Attach the policy to the intended MCP servers and set enforced=true.",
          action: {
            type: "enable-profile",
            draftPayload: {
              policyId: policy.id,
              policyName: policy.name,
              enforced: true,
              appliesToServers: targets.length > 0 ? targets : undefined,
            },
          },
        })
      );
    }

    return findings;
  }
}
