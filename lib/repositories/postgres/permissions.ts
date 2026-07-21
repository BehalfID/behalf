/**
 * Test-only Postgres permission adapters — not exported from lib/repositories/index.ts.
 */

import { and, arrayContains, desc, eq, or, sql } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { permissions } from "@/lib/db/postgres/schema";

export type PermissionRecord = {
  permissionId: string;
  accountId: string | null;
  agentId: string;
  action: string;
  allowedActions: string[];
  blockedActions: string[];
  status: string;
  lastUsedAt: Date | null;
};

function toRecord(row: typeof permissions.$inferSelect): PermissionRecord {
  return {
    permissionId: row.permissionId,
    accountId: row.accountId ?? null,
    agentId: row.agentId,
    action: row.action,
    allowedActions: row.allowedActions ?? [],
    blockedActions: row.blockedActions ?? [],
    status: row.status,
    lastUsedAt: row.lastUsedAt ?? null
  };
}

export async function createPermission(
  db: BehalfPostgresDb,
  input: {
    permissionId: string;
    accountId: string;
    agentId: string;
    action: string;
    developerUserId?: string;
    allowedActions?: string[];
    blockedActions?: string[];
    status?: string;
  }
): Promise<PermissionRecord> {
  const [row] = await db
    .insert(permissions)
    .values({
      permissionId: input.permissionId,
      accountId: input.accountId,
      agentId: input.agentId,
      action: input.action,
      developerUserId: input.developerUserId,
      allowedActions: input.allowedActions ?? [],
      blockedActions: input.blockedActions ?? [],
      status: input.status ?? "active"
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create permission");
  }
  return toRecord(row);
}

export async function findPermissionsMatchingAction(
  db: BehalfPostgresDb,
  agentId: string,
  action: string
): Promise<PermissionRecord[]> {
  const rows = await db
    .select()
    .from(permissions)
    .where(
      and(
        eq(permissions.agentId, agentId),
        or(
          eq(permissions.action, action),
          arrayContains(permissions.allowedActions, [action]),
          arrayContains(permissions.blockedActions, [action])
        )
      )
    )
    .orderBy(desc(permissions.createdAt));

  return rows.map(toRecord);
}

export async function touchPermissionLastUsed(
  db: BehalfPostgresDb,
  permissionId: string,
  lastUsedAt: Date
) {
  return db
    .update(permissions)
    .set({ lastUsedAt })
    .where(eq(permissions.permissionId, permissionId));
}

export async function findPermissionsByAccountAndAgent(
  db: BehalfPostgresDb,
  accountId: string,
  agentId: string,
  options?: { limit?: number }
): Promise<PermissionRecord[]> {
  const query = db
    .select()
    .from(permissions)
    .where(and(eq(permissions.accountId, accountId), eq(permissions.agentId, agentId)))
    .orderBy(desc(permissions.createdAt));

  const rows = options?.limit ? await query.limit(options.limit) : await query;
  return rows.map(toRecord);
}

export async function backfillPermissionAccountId(
  db: BehalfPostgresDb,
  agentId: string,
  accountId: string
) {
  return db
    .update(permissions)
    .set({ accountId })
    .where(and(eq(permissions.agentId, agentId), sql`${permissions.accountId} IS NULL`));
}
