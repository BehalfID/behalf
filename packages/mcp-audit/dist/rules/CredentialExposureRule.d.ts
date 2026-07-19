import type { AuditContext, AuditRule, McpAuditFinding } from "../types.js";
/**
 * Detects configuration that appears to expose API keys, bearer tokens,
 * secrets, or passwords.
 *
 * Evidence never includes the secret value itself — only key / env names.
 *
 * Category: credential-exposure
 */
export declare class CredentialExposureRule implements AuditRule {
    readonly id = "credential-exposure";
    readonly name = "Credential Exposure";
    execute(context: AuditContext): Promise<McpAuditFinding[]>;
}
