import type { PipelineStage } from "mongoose";
import VerificationLog from "@/models/VerificationLog";

export async function createVerificationLog(input: Record<string, unknown>) {
  return VerificationLog.create(input);
}

export async function findVerificationLogs(
  query: Record<string, unknown>,
  options?: { limit?: number; select?: string }
) {
  const cursor = VerificationLog.find(query).sort({ createdAt: -1 });
  if (options?.limit) cursor.limit(options.limit);
  if (options?.select) cursor.select(options.select);
  return cursor.lean();
}

export async function aggregateVerificationLogs<T>(pipeline: PipelineStage[]) {
  if (typeof VerificationLog.aggregate !== "function") {
    return null;
  }
  return VerificationLog.aggregate<T>(pipeline);
}

export async function backfillVerificationLogAccountId(agentId: string, accountId: string) {
  return VerificationLog.updateMany(
    {
      agentId,
      $or: [{ accountId: { $exists: false } }, { accountId: null }]
    },
    { $set: { accountId } }
  );
}

export async function findVerificationLogsByAccount(
  accountId: string,
  options?: { limit?: number; agentId?: string }
) {
  const query: Record<string, unknown> = { accountId };
  if (options?.agentId) query.agentId = options.agentId;
  const cursor = VerificationLog.find(query).sort({ createdAt: -1 });
  if (options?.limit) cursor.limit(options.limit);
  const rows = await cursor.lean();
  return rows.map((row) => ({
    logId: row.logId as string,
    requestId: row.requestId as string,
    accountId: (row.accountId as string | null | undefined) ?? null,
    agentId: row.agentId as string,
    action: row.action as string,
    allowed: Boolean(row.allowed),
    reason: row.reason as string,
    risk: row.risk as string
  }));
}

export async function createVerificationLogRecord(input: {
  logId: string;
  requestId: string;
  accountId?: string | null;
  agentId: string;
  action: string;
  allowed: boolean;
  reason: string;
  risk: string;
}) {
  const doc = (await VerificationLog.create(input)) as {
    logId: string;
    requestId: string;
    accountId?: string | null;
    agentId: string;
    action: string;
    allowed: boolean;
    reason: string;
    risk: string;
  };
  return {
    logId: doc.logId,
    requestId: doc.requestId,
    accountId: doc.accountId ?? null,
    agentId: doc.agentId,
    action: doc.action,
    allowed: doc.allowed,
    reason: doc.reason,
    risk: doc.risk
  };
}
