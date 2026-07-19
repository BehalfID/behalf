/**
 * Decision Engine — single place that maps policy + risk + approval
 * into a final {@link RuntimeDecision}. No module may bypass this.
 */
export class DecisionEngine {
    decide(input) {
        const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
        if (input.blockServer || input.policy.verdict === "deny") {
            return this.build("deny", input, input.policy.reason || "Denied by policy", evaluatedAt);
        }
        if (input.approval) {
            if (input.approval.status === "denied") {
                return this.build("deny", input, "Denied by user approval decision", evaluatedAt, input.approval.id);
            }
            if (input.approval.status === "approved-once" ||
                input.approval.status === "always-allowed") {
                const type = input.forceAudit ? "allow-with-audit" : "allow";
                return this.build(type, input, `Approved by user (${input.approval.choice})`, evaluatedAt, input.approval.id);
            }
            if (input.approval.status === "pending") {
                return this.build("require-approval", input, input.policy.reason || "Approval required", evaluatedAt, input.approval.id);
            }
        }
        if (input.policy.verdict === "require-approval") {
            return this.build("require-approval", input, input.policy.reason, evaluatedAt, input.approval?.id);
        }
        if (input.policy.verdict === "allow") {
            const type = input.forceAudit || input.risk.level === "high" || input.risk.level === "critical"
                ? "allow-with-audit"
                : "allow";
            return this.build(type, input, input.policy.reason, evaluatedAt);
        }
        // abstain → fail closed
        return this.build("deny", input, "Denied: no policy allowed this action (fail-closed)", evaluatedAt);
    }
    build(type, input, reason, evaluatedAt, approvalId) {
        // Map block-server when explicitly requested
        const finalType = input.blockServer && type === "deny" ? "block-server" : type;
        return {
            type: finalType,
            requestId: input.requestId,
            reason,
            risk: input.risk.level,
            riskScore: input.risk.score,
            policyMatched: input.policy.matchedPolicyId,
            approvalId,
            allowed: finalType === "allow" || finalType === "allow-with-audit",
            evaluatedAt,
        };
    }
}
