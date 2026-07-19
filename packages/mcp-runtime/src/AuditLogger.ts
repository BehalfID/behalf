import { createId } from "./utils/hash.js";
import type { AuditEvent, DecisionType, RiskLevel } from "./types.js";

export interface AuditStore {
  append(event: AuditEvent): Promise<void> | void;
  list(filter?: {
    sessionId?: string;
    requestId?: string;
    userId?: string;
  }): Promise<AuditEvent[]> | AuditEvent[];
}

export class InMemoryAuditStore implements AuditStore {
  private readonly events: AuditEvent[] = [];

  append(event: AuditEvent): void {
    // Immutable append-only log
    this.events.push(Object.freeze({ ...event }));
  }

  list(filter?: {
    sessionId?: string;
    requestId?: string;
    userId?: string;
  }): AuditEvent[] {
    return this.events.filter((e) => {
      if (filter?.sessionId && e.sessionId !== filter.sessionId) return false;
      if (filter?.requestId && e.requestId !== filter.requestId) return false;
      if (filter?.userId && e.userId !== filter.userId) return false;
      return true;
    });
  }
}

/**
 * Audit Logger — every decision produces an immutable audit event.
 * Never logs raw secrets; arguments are represented only by hash.
 */
export class AuditLogger {
  constructor(private readonly store: AuditStore) {}

  async log(input: {
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
  }): Promise<AuditEvent> {
    const event: AuditEvent = {
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

  async list(filter?: {
    sessionId?: string;
    requestId?: string;
    userId?: string;
  }): Promise<AuditEvent[]> {
    return this.store.list(filter);
  }
}
