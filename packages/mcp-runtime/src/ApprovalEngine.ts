import { createId } from "./utils/hash.js";
import type {
  ApprovalChoice,
  ApprovalRequest,
  ApprovalResolution,
  ApprovalStatus,
  ExecutionContext,
  RiskLevel,
} from "./types.js";

export interface ApprovalStore {
  create(request: ApprovalRequest): Promise<void> | void;
  get(id: string): Promise<ApprovalRequest | undefined> | ApprovalRequest | undefined;
  getByRequestId(
    requestId: string
  ): Promise<ApprovalRequest | undefined> | ApprovalRequest | undefined;
  update(request: ApprovalRequest): Promise<void> | void;
  list(filter?: {
    sessionId?: string;
    userId?: string;
    status?: ApprovalStatus;
  }): Promise<ApprovalRequest[]> | ApprovalRequest[];
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly byId = new Map<string, ApprovalRequest>();

  create(request: ApprovalRequest): void {
    this.byId.set(request.id, request);
  }

  get(id: string): ApprovalRequest | undefined {
    return this.byId.get(id);
  }

  getByRequestId(requestId: string): ApprovalRequest | undefined {
    return [...this.byId.values()].find((r) => r.requestId === requestId);
  }

  update(request: ApprovalRequest): void {
    this.byId.set(request.id, request);
  }

  list(filter?: {
    sessionId?: string;
    userId?: string;
    status?: ApprovalStatus;
  }): ApprovalRequest[] {
    return [...this.byId.values()].filter((r) => {
      if (filter?.sessionId && r.sessionId !== filter.sessionId) return false;
      if (filter?.userId && r.userId !== filter.userId) return false;
      if (filter?.status && r.status !== filter.status) return false;
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
  constructor(private readonly store: ApprovalStore) {}

  async requestApproval(input: {
    execution: ExecutionContext;
    reason: string;
    risk: RiskLevel;
    permission?: string;
  }): Promise<ApprovalRequest> {
    const existing = await this.store.getByRequestId(input.execution.requestId);
    if (existing && existing.status === "pending") {
      return existing;
    }

    const always = await this.findAlwaysAllow(input.execution, input.permission);
    if (always) {
      return always;
    }

    const request: ApprovalRequest = {
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

  async resolve(resolution: ApprovalResolution): Promise<ApprovalRequest> {
    const current = await this.store.get(resolution.approvalId);
    if (!current) {
      throw new Error(`Unknown approval: ${resolution.approvalId}`);
    }
    if (current.status !== "pending") {
      throw new Error(`Approval ${resolution.approvalId} is already ${current.status}`);
    }

    const status = choiceToStatus(resolution.choice);
    const updated: ApprovalRequest = {
      ...current,
      status,
      choice: resolution.choice,
      resolvedAt: new Date().toISOString(),
    };
    await this.store.update(updated);
    return updated;
  }

  async get(id: string): Promise<ApprovalRequest | undefined> {
    return this.store.get(id);
  }

  async getByRequestId(requestId: string): Promise<ApprovalRequest | undefined> {
    return this.store.getByRequestId(requestId);
  }

  /**
   * Returns true when a prior always-allow covers this invocation
   * (same user + server + tool + permission).
   */
  async hasAlwaysAllow(
    execution: ExecutionContext,
    permission?: string
  ): Promise<boolean> {
    const hit = await this.findAlwaysAllow(execution, permission);
    return Boolean(hit);
  }

  private async findAlwaysAllow(
    execution: ExecutionContext,
    permission?: string
  ): Promise<ApprovalRequest | undefined> {
    const list = await this.store.list({
      userId: execution.session.userId,
      status: "always-allowed",
    });
    return list.find(
      (r) =>
        r.server === execution.invocation.server &&
        r.tool === execution.invocation.tool &&
        (permission === undefined || r.permission === permission)
    );
  }
}

function choiceToStatus(choice: ApprovalChoice): ApprovalStatus {
  switch (choice) {
    case "approve-once":
      return "approved-once";
    case "always-allow":
      return "always-allowed";
    case "deny":
      return "denied";
  }
}
