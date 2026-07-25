import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
import { configEvidence, createFinding } from "../utils/finding.js";

const FS_PERM_PATTERN =
  /\b(filesystem|fs|file)[:._-]?(?:\*|all|unrestricted|recursive|home|~|\$HOME)\b/i;

/**
 * Detects servers requesting unrestricted filesystem access, home directory
 * access, or recursive directory access.
 *
 * Category: filesystem-access
 */
export class FilesystemAccessRule implements AuditRule {
  readonly id = "filesystem-access";
  readonly name = "Filesystem Access";

  async execute(context: AuditContext): Promise<McpAuditFinding[]> {
    const { configuration } = context;
    const findings: McpAuditFinding[] = [];

    for (const server of configuration.servers) {
      const reasons: string[] = [];
      const caps = server.capabilities;

      if (caps?.filesystemUnrestricted) {
        reasons.push("capabilities.filesystemUnrestricted=true");
      }
      if (caps?.homeDirectoryAccess) {
        reasons.push("capabilities.homeDirectoryAccess=true");
      }
      if (caps?.recursiveDirectoryAccess) {
        reasons.push("capabilities.recursiveDirectoryAccess=true");
      }

      for (const tool of server.tools ?? []) {
        for (const perm of tool.permissions ?? []) {
          if (FS_PERM_PATTERN.test(perm) || perm === "filesystem:*" || perm === "fs:*") {
            reasons.push(`tool.${tool.name}.permission=${perm}`);
          }
        }
      }

      // Heuristic: args that pass home / recursive roots
      for (const arg of server.args ?? []) {
        if (/(^|[\\/])(\$HOME|~|\/Users\/|\/home\/|%USERPROFILE%)/i.test(arg)) {
          reasons.push(`args contains home-path hint`);
          break;
        }
        if (/--?(recursive|all-files|unrestricted)/i.test(arg)) {
          reasons.push(`args contains unrestricted/recursive filesystem flag`);
          break;
        }
      }

      if (reasons.length === 0) continue;

      const severity =
        caps?.filesystemUnrestricted || reasons.some((r) => r.includes("unrestricted"))
          ? "high"
          : "medium";

      findings.push(
        createFinding({
          ruleId: this.id,
          category: "filesystem-access",
          severity,
          title: `Broad filesystem access: ${server.name}`,
          description:
            `Server "${server.name}" requests unrestricted, home-directory, or recursive filesystem access.`,
          evidence: [
            configEvidence(configuration.sourcePath ?? server.configPath, server.name),
            `server.name=${server.name}`,
            ...reasons,
          ],
          serverName: server.name,
          remediation:
            "Scope filesystem permissions to specific directories and require approval for writes.",
          action: {
            type: "create-permission",
            draftPayload: {
              action: "file:read",
              resource: `mcp:${server.name}`,
              requiresApproval: true,
              blockedActions: ["file:delete", "file:write"],
              notes: "Generated from filesystem-access audit finding",
            },
          },
        })
      );
    }

    return findings;
  }
}
