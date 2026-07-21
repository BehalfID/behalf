import Permission from "@/models/Permission";

export async function findPermissionsMatchingAction(agentId: string, action: string) {
  return Permission.find({
    agentId,
    $or: [{ action }, { allowedActions: action }, { blockedActions: action }]
  }).sort({ createdAt: -1 });
}

export async function touchPermissionLastUsed(permissionId: string, lastUsedAt: Date) {
  return Permission.updateOne({ permissionId }, { $set: { lastUsedAt } });
}

export async function createPermission(input: Record<string, unknown>) {
  return Permission.create(input);
}

export async function createPermissionRecord(input: {
  permissionId: string;
  accountId: string;
  agentId: string;
  action: string;
  allowedActions?: string[];
  blockedActions?: string[];
  status?: string;
  developerUserId?: string;
}) {
  const doc = (await Permission.create({
    permissionId: input.permissionId,
    accountId: input.accountId,
    agentId: input.agentId,
    action: input.action,
    allowedActions: input.allowedActions ?? [],
    blockedActions: input.blockedActions ?? [],
    status: input.status ?? "active",
    developerUserId: input.developerUserId
  })) as {
    permissionId: string;
    accountId?: string | null;
    agentId: string;
    action: string;
    allowedActions?: string[];
    blockedActions?: string[];
    status: string;
    lastUsedAt?: Date | null;
  };
  return {
    permissionId: doc.permissionId,
    accountId: doc.accountId ?? null,
    agentId: doc.agentId,
    action: doc.action,
    allowedActions: doc.allowedActions ?? [],
    blockedActions: doc.blockedActions ?? [],
    status: doc.status,
    lastUsedAt: doc.lastUsedAt ?? null
  };
}

export async function findPermissionsMatchingActionRecords(agentId: string, action: string) {
  const rows = await Permission.find({
    agentId,
    $or: [{ action }, { allowedActions: action }, { blockedActions: action }]
  })
    .sort({ createdAt: -1 })
    .lean();

  return rows.map((row) => ({
    permissionId: row.permissionId,
    accountId: row.accountId ?? null,
    agentId: row.agentId,
    action: row.action,
    allowedActions: row.allowedActions ?? [],
    blockedActions: row.blockedActions ?? [],
    status: row.status,
    lastUsedAt: row.lastUsedAt ?? null
  }));
}

export async function findPermissionRecordsByAccountAndAgent(
  accountId: string,
  agentId: string,
  options?: { limit?: number }
) {
  const query = Permission.find({ accountId, agentId }).sort({ createdAt: -1 });
  if (options?.limit) query.limit(options.limit);
  const rows = await query.lean();
  return rows.map((row) => ({
    permissionId: row.permissionId,
    accountId: row.accountId ?? null,
    agentId: row.agentId,
    action: row.action,
    allowedActions: row.allowedActions ?? [],
    blockedActions: row.blockedActions ?? [],
    status: row.status,
    lastUsedAt: row.lastUsedAt ?? null
  }));
}

export async function findPermissionsByAccountAndAgent(
  accountFilter: Record<string, unknown>,
  agentId: string,
  options?: { limit?: number; select?: string }
) {
  const query = Permission.find({ ...accountFilter, agentId }).sort({ createdAt: -1 });
  if (options?.limit) query.limit(options.limit);
  if (options?.select) query.select(options.select);
  return query.lean();
}

export async function backfillPermissionAccountId(agentId: string, accountId: string) {
  return Permission.updateMany(
    {
      agentId,
      $or: [{ accountId: { $exists: false } }, { accountId: null }]
    },
    { $set: { accountId } }
  );
}
