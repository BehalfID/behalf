import { createId } from "./utils/hash.js";
export class InMemoryApprovalStore {
    byId = new Map();
    create(request) {
        this.byId.set(request.id, request);
    }
    get(id) {
        return this.byId.get(id);
    }
    getByRequestId(requestId) {
        return [...this.byId.values()].find((r) => r.requestId === requestId);
    }
    update(request) {
        this.byId.set(request.id, request);
    }
    list(filter) {
        return [...this.byId.values()].filter((r) => {
            if (filter?.sessionId && r.sessionId !== filter.sessionId)
                return false;
            if (filter?.userId && r.userId !== filter.userId)
                return false;
            if (filter?.status && r.status !== filter.status)
                return false;
            return true;
        });
    }
}
/**
 * Approval Engine — backend state machine only (no UI).
 *
 * States: pending → approved-once | always-allowed | denied | expired
 */
export class ApprovalEngine {
    store;
    constructor(store) {
        this.store = store;
    }
    async requestApproval(input) {
        const existing = await this.store.getByRequestId(input.execution.requestId);
        if (existing && existing.status === "pending") {
            return existing;
        }
        const always = await this.findAlwaysAllow(input.execution, input.permission);
        if (always) {
            return always;
        }
        const request = {
            id: createId("appr"),
            requestId: input.execution.requestId,
            sessionId: input.execution.session.sessionId,
            userId: input.execution.session.userId,
            workspaceId: input.execution.session.workspaceId,
            server: input.execution.invocation.server,
            tool: input.execution.invocation.tool,
            permission: input.permission,
            resource: input.execution.invocation.resource,
            reason: input.reason,
            risk: input.risk,
            argumentsHash: input.execution.argumentsHash,
            status: "pending",
            createdAt: new Date().toISOString(),
        };
        await this.store.create(request);
        return request;
    }
    async resolve(resolution) {
        const current = await this.store.get(resolution.approvalId);
        if (!current) {
            throw new Error(`Unknown approval: ${resolution.approvalId}`);
        }
        if (current.status !== "pending") {
            throw new Error(`Approval ${resolution.approvalId} is already ${current.status}`);
        }
        const status = choiceToStatus(resolution.choice);
        const updated = {
            ...current,
            status,
            choice: resolution.choice,
            resolvedAt: new Date().toISOString(),
        };
        await this.store.update(updated);
        return updated;
    }
    async get(id) {
        return this.store.get(id);
    }
    async getByRequestId(requestId) {
        return this.store.getByRequestId(requestId);
    }
    /**
     * Returns true when a prior always-allow covers this invocation
     * (same user + server + tool + permission).
     */
    async hasAlwaysAllow(execution, permission) {
        const hit = await this.findAlwaysAllow(execution, permission);
        return Boolean(hit);
    }
    async findAlwaysAllow(execution, permission) {
        const list = await this.store.list({
            userId: execution.session.userId,
            status: "always-allowed",
        });
        return list.find((r) => r.server === execution.invocation.server &&
            r.tool === execution.invocation.tool &&
            (permission === undefined || r.permission === permission));
    }
}
function choiceToStatus(choice) {
    switch (choice) {
        case "approve-once":
            return "approved-once";
        case "always-allow":
            return "always-allowed";
        case "deny":
            return "denied";
    }
}
