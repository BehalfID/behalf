import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
import { configEvidence, createFinding } from "../utils/finding.js";

const NETWORK_PERM_PATTERN =
  /\b(network|http|https|fetch|url|web)[:._-]?(?:\*|all|unrestricted)?\b/i;

const NETWORK_TOOL_PATTERN =
  /\b(fetch|http|https|request|browse|web[_-]?search|download|curl|wget)\b/i;

/**
 * Detects unrestricted outbound requests, remote fetch capability,
 * HTTP clients, and arbitrary URL access.
 *
 * Category: network-access
 */
export class NetworkAccessRule implements AuditRule {
  readonly id = "network-access";
  readonly name = "Network Access";

  async execute(context: AuditContext): Promise<McpAuditFinding[]> {
    const { configuration } = context;
    const findings: McpAuditFinding[] = [];

    for (const server of configuration.servers) {
      const reasons: string[] = [];
      const caps = server.capabilities;

      if (caps?.networkUnrestricted) {
        reasons.push("capabilities.networkUnrestricted=true");
      }
      if (caps?.remoteFetch) {
        reasons.push("capabilities.remoteFetch=true");
      }
      if (caps?.httpClient) {
        reasons.push("capabilities.httpClient=true");
      }
      if (
        caps?.allowedUrls &&
        (caps.allowedUrls.length === 0 ||
          caps.allowedUrls.some((u) => u === "*" || u === "*://*/*"))
      ) {
        reasons.push("capabilities.allowedUrls allows arbitrary URLs");
      }

      for (const tool of server.tools ?? []) {
        if (NETWORK_TOOL_PATTERN.test(tool.name)) {
          reasons.push(`tool.name=${tool.name}`);
        }
        if (tool.description && NETWORK_TOOL_PATTERN.test(tool.description)) {
          reasons.push(`tool.${tool.name}.description indicates network access`);
        }
        for (const perm of tool.permissions ?? []) {
          if (NETWORK_PERM_PATTERN.test(perm)) {
            reasons.push(`tool.${tool.name}.permission=${perm}`);
          }
        }
      }

      if (server.url && /^https?:\/\//i.test(server.url)) {
        reasons.push("server.url indicates remote HTTP MCP endpoint");
      }

      if (reasons.length === 0) continue;

      const severity =
        caps?.networkUnrestricted ||
        reasons.some((r) => r.includes("arbitrary URLs") || r.includes("Unrestricted"))
          ? "high"
          : "medium";

      findings.push(
        createFinding({
          ruleId: this.id,
          category: "network-access",
          severity,
          title: `Network access: ${server.name}`,
          description:
            `Server "${server.name}" has unrestricted outbound, remote fetch, HTTP client, or arbitrary URL capability.`,
          evidence: [
            configEvidence(configuration.sourcePath ?? server.configPath, server.name),
            `server.name=${server.name}`,
            ...unique(reasons),
          ],
          serverName: server.name,
          remediation:
            "Restrict allowed URLs and require approval for outbound network tools.",
          action: {
            type: "create-permission",
            draftPayload: {
              action: "browse_web",
              resource: "web",
              requiresApproval: true,
              notes: "Generated from network-access audit finding",
              serverName: server.name,
            },
          },
        })
      );
    }

    return findings;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
