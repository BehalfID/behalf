import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
import { configEvidence, createFinding } from "../utils/finding.js";

/** Matches risky verbs as whole tokens or prefixes (e.g. deploy_production). */
const APPROVAL_REQUIRED_NAME =
  /(^|[^a-z0-9])(shell|bash|exec|deploy|delete|write|payment|purchase|admin|sudo|rm|destroy|migrate|push|publish)([^a-z0-9]|$)/i;

/**
 * Identifies tools that should require user approval but currently do not.
 *
 * Generates a BehalfID `require-approval` action with a draft payload.
 *
 * Category: missing-approval
 */
export class MissingApprovalRule implements AuditRule {
  readonly id = "missing-approval";
  readonly name = "Missing Approval";

  async execute(context: AuditContext): Promise<McpAuditFinding[]> {
    const { configuration } = context;
    const findings: McpAuditFinding[] = [];

    for (const server of configuration.servers) {
      for (const tool of server.tools ?? []) {
        const shouldRequire = shouldRequireApproval(tool.name, tool.description);
        if (!shouldRequire) continue;
        if (tool.requiresApproval === true) continue;

        findings.push(
          createFinding({
            ruleId: this.id,
            category: "missing-approval",
            severity: "high",
            title: `Missing approval requirement: ${tool.name}`,
            description:
              `Tool "${tool.name}" on server "${server.name}" should require user approval but does not.`,
            evidence: [
              configEvidence(
                configuration.sourcePath ?? server.configPath,
                server.name,
                `tools.${tool.name}.requiresApproval`
              ),
              `server.name=${server.name}`,
              `tool.name=${tool.name}`,
              `tool.requiresApproval=${String(tool.requiresApproval ?? false)}`,
            ],
            serverName: server.name,
            toolName: tool.name,
            remediation: "Set requiresApproval=true or create a BehalfID permission that requires approval.",
            action: {
              type: "require-approval",
              draftPayload: {
                serverName: server.name,
                toolName: tool.name,
                action: "mcp_tool",
                resource: `mcp:${server.name}:${tool.name}`,
                requiresApproval: true,
              },
            },
          })
        );
      }
    }

    return findings;
  }
}

function shouldRequireApproval(name: string, description?: string): boolean {
  if (APPROVAL_REQUIRED_NAME.test(name)) return true;
  if (description && APPROVAL_REQUIRED_NAME.test(description)) return true;
  return false;
}
