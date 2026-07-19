import { createId } from "./utils/hash.js";
export class InMemoryAuditStore {
    events = [];
    append(event) {
        // Immutable append-only log
        this.events.push(Object.freeze({ ...event }));
    }
    list(filter) {
        return this.events.filter((e) => {
            if (filter?.sessionId && e.sessionId !== filter.sessionId)
                return false;
            if (filter?.requestId && e.requestId !== filter.requestId)
                return false;
            if (filter?.userId && e.userId !== filter.userId)
                return false;
            return true;
        });
    }
}
/**
 * Audit Logger — every decision produces an immutable audit event.
 * Never logs raw secrets; arguments are represented only by hash.
 */
export class AuditLogger {
    store;
    constructor(store) {
        this.store = store;
    }
    async log(input) {
        const event = {
            id: createId("audit"),
            timestamp: new Date().toISOString(),
            requestId: input.requestId,
            sessionId: input.sessionId,
            userId: input.userId,
            workspaceId: input.workspaceId,
            server: input.server,
            tool: input.tool,
            permission: input.permission,
            argumentsHash: input.argumentsHash,
            decision: input.decision,
            risk: input.risk,
            policyMatched: input.policyMatched,
            approvalRequired: input.approvalRequired,
            approvalId: input.approvalId,
            reason: input.reason,
            executionDurationMs: input.executionDurationMs,
            result: input.result,
            error: input.error,
        };
        await this.store.append(event);
        return event;
    }
    async list(filter) {
        return this.store.list(filter);
    }
}
