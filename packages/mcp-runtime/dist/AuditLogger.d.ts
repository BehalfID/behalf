import type { AuditEvent, DecisionType, RiskLevel } from "./types.js";
export interface AuditStore {
    append(event: AuditEvent): Promise<void> | void;
    list(filter?: {
        sessionId?: string;
        requestId?: string;
        userId?: string;
    }): Promise<AuditEvent[]> | AuditEvent[];
}
export declare class InMemoryAuditStore implements AuditStore {
    private readonly events;
    append(event: AuditEvent): void;
    list(filter?: {
        sessionId?: string;
        requestId?: string;
        userId?: string;
    }): AuditEvent[];
}
/**
 * Audit Logger — every decision produces an immutable audit event.
 * Never logs raw secrets; arguments are represented only by hash.
 */
export declare class AuditLogger {
    private readonly store;
    constructor(store: AuditStore);
    log(input: {
        requestId: string;
        sessionId: string;
        userId: string;
        workspaceId?: string;
        server: string;
        tool: string;
        permission?: string;
        argumentsHash: string;
        decision: DecisionType;
        risk: RiskLevel;
        policyMatched?: string;
        approvalRequired: boolean;
        approvalId?: string;
        reason: string;
        executionDurationMs?: number;
        result?: "success" | "failure" | "skipped";
        error?: string;
    }): Promise<AuditEvent>;
    list(filter?: {
        sessionId?: string;
        requestId?: string;
        userId?: string;
    }): Promise<AuditEvent[]>;
}
