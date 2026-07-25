import { configEvidence, createFinding } from "../utils/finding.js";
/**
 * Detects configurations that default to allowing actions when policy
 * evaluation fails (fail-open posture).
 *
 * Severity: critical
 * Category: fail-open
 */
export class FailOpenRule {
    id = "fail-open";
    name = "Fail Open";
    async execute(context) {
        const { configuration } = context;
        const findings = [];
        if (configuration.failOpenDefault === true) {
            findings.push(createFinding({
                ruleId: this.id,
                category: "fail-open",
                severity: "critical",
                title: "Host defaults to fail-open",
                description: "Configuration defaults to allowing actions when policy evaluation fails. BehalfID recommends fail-closed.",
                evidence: [
                    `${configuration.sourcePath ?? "configuration"}.failOpenDefault=true`,
                ],
                remediation: "Set failOpenDefault to false so unavailable verification denies the action.",
                action: {
                    type: "enable-profile",
                    draftPayload: {
                        profile: "fail-closed",
                        failOpenDefault: false,
                    },
                },
            }));
        }
        for (const server of configuration.servers) {
            if (server.failOpen !== true)
                continue;
            findings.push(createFinding({
                ruleId: this.id,
                category: "fail-open",
                severity: "critical",
                title: `Fail-open enabled: ${server.name}`,
                description: `Server "${server.name}" allows actions when policy evaluation fails.`,
                evidence: [
                    configEvidence(configuration.sourcePath ?? server.configPath, server.name, "failOpen"),
                    `server.name=${server.name}`,
                    "server.failOpen=true",
                ],
                serverName: server.name,
                remediation: "Disable fail-open for this server; deny when verification is unavailable.",
                action: {
                    type: "enable-profile",
                    draftPayload: {
                        serverName: server.name,
                        profile: "fail-closed",
                        failOpen: false,
                    },
                },
            }));
        }
        return findings;
    }
}
