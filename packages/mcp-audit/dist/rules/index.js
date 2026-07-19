import { ConfigurationIssuesRule } from "./ConfigurationIssuesRule.js";
import { CredentialExposureRule } from "./CredentialExposureRule.js";
import { DangerousToolRule } from "./DangerousToolRule.js";
import { FailOpenRule } from "./FailOpenRule.js";
import { FilesystemAccessRule } from "./FilesystemAccessRule.js";
import { MissingApprovalRule } from "./MissingApprovalRule.js";
import { NetworkAccessRule } from "./NetworkAccessRule.js";
import { UnenforcedPolicyRule } from "./UnenforcedPolicyRule.js";
import { UntrustedServerRule } from "./UntrustedServerRule.js";
/**
 * Built-in audit rules shipped with `@behalfid/mcp-audit`.
 *
 * To add a new rule:
 * 1. Create a class implementing {@link AuditRule}
 * 2. Export it from this module (optional)
 * 3. Register it via {@link RuleRegistry.register} — no engine changes needed
 */
export function createDefaultRules() {
    return [
        new ConfigurationIssuesRule(),
        new UntrustedServerRule(),
        new DangerousToolRule(),
        new FilesystemAccessRule(),
        new NetworkAccessRule(),
        new CredentialExposureRule(),
        new MissingApprovalRule(),
        new FailOpenRule(),
        new UnenforcedPolicyRule(),
    ];
}
export { ConfigurationIssuesRule, CredentialExposureRule, DangerousToolRule, FailOpenRule, FilesystemAccessRule, MissingApprovalRule, NetworkAccessRule, UnenforcedPolicyRule, UntrustedServerRule, };
