let findingCounter = 0;
/** Reset the finding id counter (for deterministic tests). */
export function resetFindingIdCounter() {
    findingCounter = 0;
}
/** Build a finding with a stable unique id. */
export function createFinding(input) {
    findingCounter += 1;
    const scope = [input.serverName, input.toolName].filter(Boolean).join(":");
    const id = `${input.ruleId}:${scope || "global"}:${findingCounter}`;
    return {
        id,
        ruleId: input.ruleId,
        category: input.category,
        severity: input.severity,
        title: input.title,
        description: input.description,
        evidence: [...input.evidence],
        serverName: input.serverName,
        toolName: input.toolName,
        remediation: input.remediation,
        action: input.action,
    };
}
/** Config path helper for evidence strings. */
export function configEvidence(sourcePath, serverName, field) {
    const base = sourcePath ?? "mcpServers";
    const path = `${base}#mcpServers.${serverName}`;
    return field ? `${path}.${field}` : path;
}
