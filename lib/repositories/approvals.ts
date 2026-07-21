import ApprovalRequest from "@/models/ApprovalRequest";

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
  );
}

export async function consumeApprovedAgentGrant(filter: Record<string, unknown>, now: Date) {
  return ApprovalRequest.findOneAndUpdate(
    filter,
    {
      $set: {
        status: "used",
        usedAt: now
      }
    },
    { returnDocument: "before" }
  );
}

export async function upsertPendingAgentApproval(
  pendingFilter: Record<string, unknown>,
  setOnInsert: Record<string, unknown>
) {
  try {
    return await ApprovalRequest.findOneAndUpdate(
      pendingFilter,
      { $setOnInsert: setOnInsert },
      { upsert: true, returnDocument: "after" }
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return ApprovalRequest.findOne(pendingFilter);
  }
}

export async function findApprovalByFilter(filter: Record<string, unknown>) {
  return ApprovalRequest.findOne(filter).lean();
}

export async function updateApprovalByFilter(
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return ApprovalRequest.updateOne(filter, { $set: update });
}

export async function upsertPendingApproval(
  filter: Record<string, unknown>,
  setOnInsert: Record<string, unknown>
) {
  return ApprovalRequest.findOneAndUpdate(
    filter,
    { $setOnInsert: setOnInsert },
    { upsert: true, new: true }
  ).lean();
}

export type AgentApprovalTuple = {
  agentId: string;
  permissionId: string;
  action: string;
  vendor?: string | null;
  amount?: string | number | null;
  argumentFingerprint?: string | null;
};

function tupleFilter(tuple: AgentApprovalTuple, status: string) {
  return {
    agentId: tuple.agentId,
    permissionId: tuple.permissionId,
    action: tuple.action,
    vendor: tuple.vendor ?? null,
    amount: tuple.amount ?? null,
    argumentFingerprint: tuple.argumentFingerprint ?? null,
    status,
    kind: "agent_action" as const
  };
}

export async function upsertPendingAgentApprovalRecord(
  tuple: AgentApprovalTuple,
  setOnInsert: {
    approvalId: string;
    requestId: string;
    accountId?: string | null;
    requiredAuthorityLevel?: number | null;
  }
) {
  const pending = await upsertPendingAgentApproval(tupleFilter(tuple, "pending"), {
    ...setOnInsert,
    kind: "agent_action"
  });
  return {
    approvalId: pending?.approvalId as string,
    requestId: pending?.requestId as string,
    status: pending?.status as string,
    argumentFingerprint: (pending?.argumentFingerprint as string | null | undefined) ?? null,
    usedAt: (pending?.usedAt as Date | null | undefined) ?? null
  };
}

export async function approveAgentGrant(
  approvalId: string,
  grantExpiresAt: Date,
  resolvedBy?: string
) {
  const row = await ApprovalRequest.findOneAndUpdate(
    { approvalId, status: "pending" },
    {
      $set: {
        status: "approved",
        grantExpiresAt,
        resolvedAt: new Date(),
        resolvedBy: resolvedBy ?? null
      }
    },
    { returnDocument: "after" }
  ).lean();

  if (!row) return null;
  return {
    approvalId: row.approvalId,
    requestId: row.requestId,
    status: row.status,
    argumentFingerprint: row.argumentFingerprint ?? null,
    usedAt: row.usedAt ?? null
  };
}

export async function consumeApprovedAgentGrantRecord(tuple: AgentApprovalTuple, now: Date) {
  const grant = await consumeApprovedAgentGrant(
    {
      ...tupleFilter(tuple, "approved"),
      status: "approved",
      grantExpiresAt: { $gt: now }
    },
    now
  );
  if (!grant) return null;
  return {
    approvalId: grant.approvalId as string,
    requestId: grant.requestId as string,
    status: "used",
    argumentFingerprint: (grant.argumentFingerprint as string | null | undefined) ?? null,
    usedAt: now
  };
}

export async function findApprovalById(approvalId: string) {
  const row = await findApprovalByFilter({ approvalId });
  if (!row) return null;
  return {
    approvalId: row.approvalId as string,
    requestId: row.requestId as string,
    status: row.status as string,
    argumentFingerprint: (row.argumentFingerprint as string | null | undefined) ?? null,
    usedAt: (row.usedAt as Date | null | undefined) ?? null
  };
}
