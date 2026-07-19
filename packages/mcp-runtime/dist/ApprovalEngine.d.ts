import type { ApprovalRequest, ApprovalResolution, ApprovalStatus, ExecutionContext, RiskLevel } from "./types.js";
export interface ApprovalStore {
    create(request: ApprovalRequest): Promise<void> | void;
    get(id: string): Promise<ApprovalRequest | undefined> | ApprovalRequest | undefined;
    getByRequestId(requestId: string): Promise<ApprovalRequest | undefined> | ApprovalRequest | undefined;
    update(request: ApprovalRequest): Promise<void> | void;
    list(filter?: {
        sessionId?: string;
        userId?: string;
        status?: ApprovalStatus;
    }): Promise<ApprovalRequest[]> | ApprovalRequest[];
}
export declare class InMemoryApprovalStore implements ApprovalStore {
    private readonly byId;
    create(request: ApprovalRequest): void;
    get(id: string): ApprovalRequest | undefined;
    getByRequestId(requestId: string): ApprovalRequest | undefined;
    update(request: ApprovalRequest): void;
    list(filter?: {
        sessionId?: string;
        userId?: string;
        status?: ApprovalStatus;
    }): ApprovalRequest[];
}
/**
 * Approval Engine — backend state machine only (no UI).
 *
 * States: pending → approved-once | always-allowed | denied | expired
 */
export declare class ApprovalEngine {
    private readonly store;
    constructor(store: ApprovalStore);
    requestApproval(input: {
        execution: ExecutionContext;
        reason: string;
        risk: RiskLevel;
        permission?: string;
    }): Promise<ApprovalRequest>;
    resolve(resolution: ApprovalResolution): Promise<ApprovalRequest>;
    get(id: string): Promise<ApprovalRequest | undefined>;
    getByRequestId(requestId: string): Promise<ApprovalRequest | undefined>;
    /**
     * Returns true when a prior always-allow covers this invocation
     * (same user + server + tool + permission).
     */
    hasAlwaysAllow(execution: ExecutionContext, permission?: string): Promise<boolean>;
    private findAlwaysAllow;
}
