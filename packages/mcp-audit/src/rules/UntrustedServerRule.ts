import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
import { configEvidence, createFinding } from "../utils/finding.js";

/**
 * Detects MCP servers that are not on the trusted / approved allow-list.
 *
 * Severity: high
 * Category: untrusted-server
 */
export class UntrustedServerRule implements AuditRule {
  readonly id = "untrusted-server";
  readonly name = "Untrusted Server";

  async execute(context: AuditContext): Promise<McpAuditFinding[]> {
    const { configuration } = context;
    const trusted = new Set(
      (configuration.trustedServers ?? []).map((n) => n.toLowerCase())
    );
    const findings: McpAuditFinding[] = [];

    for (const server of configuration.servers) {
      const isTrusted =
        server.trusted === true ||
        server.approved === true ||
        trusted.has(server.name.toLowerCase());

      if (isTrusted) continue;

      findings.push(
        createFinding({
          ruleId: this.id,
          category: "untrusted-server",
          severity: "high",
          title: `Untrusted MCP server: ${server.name}`,
          description:
            `Server "${server.name}" is not marked trusted or approved and is not on the trustedServers allow-list.`,
          evidence: [
            configEvidence(configuration.sourcePath ?? server.configPath, server.name),
            `server.name=${server.name}`,
            `server.trusted=${String(server.trusted ?? false)}`,
            `server.approved=${String(server.approved ?? false)}`,
          ],
          serverName: server.name,
          remediation:
            "Add the server to trustedServers, or mark it trusted/approved after review.",
          action: {
            type: "block-action",
            draftPayload: {
              serverName: server.name,
              reason: "untrusted-server",
              untilApproved: true,
            },
          },
        })
      );
    }

    return findings;
  }
}
