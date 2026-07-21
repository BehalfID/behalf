/**
 * Test-only Postgres verification-log adapters — not exported from lib/repositories/index.ts.
 */

import { and, desc, eq } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { verificationLogs } from "@/lib/db/postgres/schema";

export type VerificationLogRecord = {
  logId: string;
  requestId: string;
  accountId: string | null;
  agentId: string;
  permissionId: string | null;
  action: string;
  allowed: boolean;
  reason: string;
  risk: string;
  shadow: boolean;
  createdAt: Date;
};

function toRecord(row: typeof verificationLogs.$inferSelect): VerificationLogRecord {
  return {
    logId: row.logId,
    requestId: row.requestId,
    accountId: row.accountId ?? null,
    agentId: row.agentId,
    permissionId: row.permissionId ?? null,
    action: row.action,
    allowed: row.allowed,
    reason: row.reason,
    risk: row.risk,
    shadow: row.shadow,
    createdAt: row.createdAt
  };
}

export async function createVerificationLog(
  db: BehalfPostgresDb,
  input: {
    logId: string;
    requestId: string;
    accountId?: string | null;
    agentId: string;
    permissionId?: string | null;
    action: string;
    allowed: boolean;
    reason: string;
    risk: string;
    shadow?: boolean;
    metadata?: Record<string, unknown> | null;
  }
): Promise<VerificationLogRecord> {
  const [row] = await db
    .insert(verificationLogs)
    .values({
      logId: input.logId,
      requestId: input.requestId,
      accountId: input.accountId ?? null,
      agentId: input.agentId,
      permissionId: input.permissionId ?? null,
      action: input.action,
      allowed: input.allowed,
      reason: input.reason,
      risk: input.risk,
      shadow: input.shadow ?? false,
      metadata: input.metadata ?? null
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create verification log");
  }
  return toRecord(row);
}

export async function findVerificationLogsByAccount(
  db: BehalfPostgresDb,
  accountId: string,
  options?: { limit?: number; agentId?: string }
): Promise<VerificationLogRecord[]> {
  const filters = [eq(verificationLogs.accountId, accountId)];
  if (options?.agentId) {
    filters.push(eq(verificationLogs.agentId, options.agentId));
  }

  const query = db
    .select()
    .from(verificationLogs)
    .where(and(...filters))
    .orderBy(desc(verificationLogs.createdAt));

  const rows = options?.limit ? await query.limit(options.limit) : await query;
  return rows.map(toRecord);
}
