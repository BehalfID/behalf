import { configEvidence, createFinding } from "../utils/finding.js";
const DANGEROUS_NAME_PATTERN = /\b(shell|bash|sh|zsh|powershell|pwsh|cmd|terminal|exec|execute|spawn|process|run[_-]?command|eval|code[_-]?exec|os\.system)\b/i;
const DANGEROUS_DESC_PATTERN = /\b(shell|terminal|arbitrary\s+code|execute\s+code|spawn\s+(a\s+)?process|run\s+(shell|commands?)|command\s+execution)\b/i;
/**
 * Identifies tools that appear capable of shell execution, terminal access,
 * arbitrary code execution, or process spawning.
 *
 * Category: dangerous-tool
 */
export class DangerousToolRule {
    id = "dangerous-tool";
    name = "Dangerous Tool Detection";
    async execute(context) {
        const { configuration } = context;
        const findings = [];
        for (const server of configuration.servers) {
            if (server.capabilities?.shellAccess || server.capabilities?.codeExecution) {
                findings.push(this.serverCapabilityFinding(configuration.sourcePath, server));
            }
            for (const tool of server.tools ?? []) {
                const reasons = detectDangerousTool(tool);
                if (reasons.length === 0)
                    continue;
                findings.push(createFinding({
                    ruleId: this.id,
                    category: "dangerous-tool",
                    severity: "high",
                    title: `Dangerous tool: ${tool.name}`,
                    description: `Tool "${tool.name}" on server "${server.name}" appears capable of shell, terminal, code execution, or process spawning.`,
                    evidence: [
                        configEvidence(configuration.sourcePath ?? server.configPath, server.name, `tools.${tool.name}`),
                        `server.name=${server.name}`,
                        `tool.name=${tool.name}`,
                        ...reasons.map((r) => `reason=${r}`),
                    ],
                    serverName: server.name,
                    toolName: tool.name,
                    remediation: "Require approval for this tool, or block it until a scoped permission exists.",
                    action: {
                        type: "require-approval",
                        draftPayload: {
                            serverName: server.name,
                            toolName: tool.name,
                            action: "mcp_tool",
                            resource: `mcp:${server.name}:${tool.name}`,
                            requiresApproval: true,
                            reason: "dangerous-tool",
                        },
                    },
                }));
            }
        }
        return findings;
    }
    serverCapabilityFinding(sourcePath, server) {
        const caps = [];
        if (server.capabilities?.shellAccess)
            caps.push("capabilities.shellAccess=true");
        if (server.capabilities?.codeExecution) {
            caps.push("capabilities.codeExecution=true");
        }
        return createFinding({
            ruleId: this.id,
            category: "dangerous-tool",
            severity: "high",
            title: `Dangerous capabilities on server: ${server.name}`,
            description: `Server "${server.name}" declares shell or code-execution capabilities.`,
            evidence: [
                configEvidence(sourcePath ?? server.configPath, server.name, "capabilities"),
                `server.name=${server.name}`,
                ...caps,
            ],
            serverName: server.name,
            remediation: "Disable shell/code-execution capabilities or require approval for all tools.",
            action: {
                type: "require-approval",
                draftPayload: {
                    serverName: server.name,
                    action: "mcp_tool",
                    resource: `mcp:${server.name}`,
                    requiresApproval: true,
                    reason: "dangerous-capability",
                },
            },
        });
    }
}
function detectDangerousTool(tool) {
    const reasons = [];
    if (DANGEROUS_NAME_PATTERN.test(tool.name)) {
        reasons.push("tool name matches shell/exec/process pattern");
    }
    if (tool.description && DANGEROUS_DESC_PATTERN.test(tool.description)) {
        reasons.push("tool description indicates shell/code execution");
    }
    for (const perm of tool.permissions ?? []) {
        if (/\b(shell|exec|process|terminal|code)\b/i.test(perm)) {
            reasons.push(`permission=${perm}`);
        }
    }
    return reasons;
}
