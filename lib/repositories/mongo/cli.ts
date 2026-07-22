import CliAuditLog, { type CliAuditLogDocument } from "@/models/CliAuditLog";
import CliPauseLease, { type CliPauseLeaseDocument } from "@/models/CliPauseLease";
import { lazyModelAdapter } from "@/lib/repositories/mongoModelAdapter";

export type CliPauseLeaseLean = CliPauseLeaseDocument;
export type CliAuditLogLean = CliAuditLogDocument;

export async function findActiveLeases(filter: {
  accountId?: string;
  userId?: string;
  deviceId?: string;
  now?: Date;
}): Promise<CliPauseLeaseLean[]> {
  const { now = new Date(), ...identity } = filter;
  return CliPauseLease.find({
    ...identity,
    granted: true,
    expiresAt: { $gt: now }
  })
    .sort({ expiresAt: -1 })
    .limit(20)
    .lean();
}

export async function createLease(input: Omit<CliPauseLeaseDocument, "_id" | "createdAt" | "updatedAt">) {
  return CliPauseLease.create(input);
}

export async function createAuditLog(input: Omit<CliAuditLogDocument, "_id" | "createdAt" | "updatedAt">) {
  return CliAuditLog.create(input);
}

export type FindAuditLogsInput = {
  accountId?: string;
  userId?: string;
  tool?: string;
  mode?: string;
  eventType?: string | { $in: string[] };
  repo?: string;
  branch?: string;
  from?: Date | null;
  to?: Date | null;
  cursor?: { createdAt: string; auditId: string } | null;
  limit: number;
};

export async function findAuditLogs(input: FindAuditLogsInput): Promise<CliAuditLogLean[]> {
  const createdAt: Record<string, Date> = {};
  if (input.from) createdAt.$gte = input.from;
  if (input.to) createdAt.$lte = input.to;

  const query: Record<string, unknown> = {
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.tool ? { tool: input.tool } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.eventType ? { eventType: input.eventType } : {}),
    ...(input.repo ? { repo: input.repo } : {}),
    ...(input.branch ? { branch: input.branch } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {})
  };

  if (input.cursor) {
    const cursorDate = new Date(input.cursor.createdAt);
    query.$or = [
      { createdAt: { $lt: cursorDate } },
      { createdAt: cursorDate, auditId: { $lt: input.cursor.auditId } }
    ];
  }

  return CliAuditLog.find(query).sort({ createdAt: -1, auditId: -1 }).limit(input.limit).lean();
}

export const auditLogModel = lazyModelAdapter(() => CliAuditLog);
export const pauseLeaseModel = lazyModelAdapter(() => CliPauseLease);

export const cliAuditLogRepository = { find: (filter: Record<string, unknown> = {}) => CliAuditLog.find(filter) };
