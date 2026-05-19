export class ActionBlockedError extends Error {
    decision;
    constructor(decision) {
        super(`Action blocked by BehalfID: ${decision.reason}`);
        this.name = "ActionBlockedError";
        this.decision = decision;
    }
}
export async function enforceAction(behalf, agentId, input, executeAction) {
    const decision = await behalf.verify({ agentId, ...input });
    if (!decision.allowed) {
        throw new ActionBlockedError(decision);
    }
    return executeAction(decision);
}
export function formatDecision(decision) {
    return `${decision.allowed ? "allowed" : "denied"} (${decision.risk}) - ${decision.reason}`;
}
