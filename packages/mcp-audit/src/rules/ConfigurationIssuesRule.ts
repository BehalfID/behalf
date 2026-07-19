import type {
  AuditContext,
  AuditRule,
  McpAuditFinding,
  McpServerConfig,
} from "../types.js";
import { configEvidence, createFinding } from "../utils/finding.js";

/**
 * Detects duplicate servers, invalid configuration, missing required fields,
 * and malformed tool definitions.
 *
 * Category: configuration
 */
export class ConfigurationIssuesRule implements AuditRule {
  readonly id = "configuration-issues";
  readonly name = "Configuration Issues";

  async execute(context: AuditContext): Promise<McpAuditFinding[]> {
    const { configuration } = context;
    const findings: McpAuditFinding[] = [];
    const seen = new Map<string, number>();

    for (const server of configuration.servers) {
      const key = server.name.toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);

      findings.push(...validateServer(configuration.sourcePath, server));
    }

    for (const [name, count] of seen) {
      if (count < 2) continue;
      const original = configuration.servers.find(
        (s) => s.name.toLowerCase() === name
      );
      findings.push(
        createFinding({
          ruleId: this.id,
          category: "configuration",
          severity: "medium",
          title: `Duplicate MCP server: ${original?.name ?? name}`,
          description: `Server name "${original?.name ?? name}" appears ${count} times in the configuration.`,
          evidence: [
            `${configuration.sourcePath ?? "mcpServers"} — duplicate name "${original?.name ?? name}" (count=${count})`,
          ],
          serverName: original?.name,
          remediation: "Rename or remove duplicate server entries.",
        })
      );
    }

    return findings;
  }
}

function validateServer(
  sourcePath: string | undefined,
  server: McpServerConfig
): McpAuditFinding[] {
  const findings: McpAuditFinding[] = [];
  const path = configEvidence(sourcePath ?? server.configPath, server.name || "(unnamed)");

  if (!server.name || !server.name.trim()) {
    findings.push(
      createFinding({
        ruleId: "configuration-issues",
        category: "configuration",
        severity: "high",
        title: "MCP server missing required name",
        description: "A server entry is missing the required name field.",
        evidence: [`${sourcePath ?? "mcpServers"} — missing name`],
        remediation: "Provide a unique non-empty server name.",
      })
    );
  }

  const hasLaunch = Boolean(server.command || server.url);
  if (!hasLaunch) {
    findings.push(
      createFinding({
        ruleId: "configuration-issues",
        category: "configuration",
        severity: "high",
        title: `Invalid server config: ${server.name || "(unnamed)"}`,
        description:
          `Server "${server.name || "(unnamed)"}" is missing both command and url — it cannot be launched.`,
        evidence: [
          path,
          "missing required field: command or url",
        ],
        serverName: server.name || undefined,
        remediation: "Set either a stdio command or a remote url for this server.",
      })
    );
  }

  if (server.args !== undefined && !Array.isArray(server.args)) {
    findings.push(
      createFinding({
        ruleId: "configuration-issues",
        category: "configuration",
        severity: "medium",
        title: `Malformed args for server: ${server.name}`,
        description: `Server "${server.name}" has a non-array args value.`,
        evidence: [path + ".args", "args must be an array of strings"],
        serverName: server.name,
        remediation: "Provide args as a string array.",
      })
    );
  }

  for (const tool of server.tools ?? []) {
    if (!tool.name || !tool.name.trim()) {
      findings.push(
        createFinding({
          ruleId: "configuration-issues",
          category: "configuration",
          severity: "medium",
          title: `Malformed tool definition on ${server.name}`,
          description: `Server "${server.name}" has a tool entry without a name.`,
          evidence: [
            configEvidence(sourcePath ?? server.configPath, server.name, "tools"),
            "tool missing required field: name",
          ],
          serverName: server.name,
          remediation: "Give every tool a non-empty name.",
        })
      );
    }
  }

  return findings;
}
