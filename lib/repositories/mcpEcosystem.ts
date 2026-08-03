import McpEcosystemSnapshot from "@/models/McpEcosystemSnapshot";

export async function findMcpEcosystemSnapshotByAccountId(accountId: string) {
  return McpEcosystemSnapshot.findOne({ accountId }).lean();
}

export async function upsertMcpEcosystemSnapshot(
  accountId: string,
  snapshotId: string,
  data: Record<string, unknown>
) {
  return McpEcosystemSnapshot.findOneAndUpdate(
    { accountId },
    {
      snapshotId,
      accountId,
      ...data,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}
