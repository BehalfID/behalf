import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
import { detectCredentialKeys } from "../utils/credentials.js";
import { configEvidence, createFinding } from "../utils/finding.js";

/**
 * Detects configuration that appears to expose API keys, bearer tokens,
 * secrets, or passwords.
 *
 * Evidence never includes the secret value itself — only key / env names.
 *
 * Category: credential-exposure
 */
export class CredentialExposureRule implements AuditRule {
  readonly id = "credential-exposure";
  readonly name = "Credential Exposure";

  async execute(context: AuditContext): Promise<McpAuditFinding[]> {
    const { configuration } = context;
    const findings: McpAuditFinding[] = [];

    for (const server of configuration.servers) {
      const hits = detectCredentialKeys(server.env);
      if (hits.length === 0) continue;

      findings.push(
        createFinding({
          ruleId: this.id,
          category: "credential-exposure",
          severity: "critical",
          title: `Credential exposure in server env: ${server.name}`,
          description:
            `Server "${server.name}" configuration appears to embed credentials in environment variables.`,
          evidence: [
            configEvidence(
              configuration.sourcePath ?? server.configPath,
              server.name,
              "env"
            ),
            `server.name=${server.name}`,
            ...hits.map(
              (h) => `env.${h.key} — ${h.reason} (value=[redacted])`
            ),
          ],
          serverName: server.name,
          remediation:
            "Remove secrets from MCP config; inject via a secret manager or OS keychain at runtime.",
          action: {
            type: "block-action",
            draftPayload: {
              serverName: server.name,
              reason: "credential-exposure",
              envKeys: hits.map((h) => h.key),
            },
          },
        })
      );
    }

    return findings;
  }
}
