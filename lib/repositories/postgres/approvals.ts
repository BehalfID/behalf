/**
 * Test-only Postgres approval adapters — not exported from lib/repositories/index.ts.
 */

import { and, eq, gt, sql } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { approvalRequests } from "@/lib/db/postgres/schema";

export type AgentApprovalTuple = {
  agentId: string;
  permissionId: string;
  action: string;
  vendor?: string | null;
  amount?: string | number | null;
  argumentFingerprint?: string | null;
};

export type ApprovalRecord = {
  approvalId: string;
  requestId: string;
  accountId: string | null;
  agentId: string | null;
  permissionId: string | null;
  action: string;
  vendor: string | null;
  amount: string | null;
  argumentFingerprint: string | null;
  status: string;
  grantExpiresAt: Date | null;
  usedAt: Date | null;
  kind: string;
};

function toAmount(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function toRecord(row: typeof approvalRequests.$inferSelect): ApprovalRecord {
  return {
    approvalId: row.approvalId,
    requestId: row.requestId,
    accountId: row.accountId ?? null,
    agentId: row.agentId ?? null,
    permissionId: row.permissionId ?? null,
    action: row.action,
    vendor: row.vendor ?? null,
    amount: row.amount ?? null,
    argumentFingerprint: row.argumentFingerprint ?? null,
    status: row.status,
    grantExpiresAt: row.grantExpiresAt ?? null,
    usedAt: row.usedAt ?? null,
    kind: row.kind
  };
}

function agentPendingWhere(tuple: AgentApprovalTuple) {
  return and(
    eq(approvalRequests.agentId, tuple.agentId),
    eq(approvalRequests.permissionId, tuple.permissionId),
    eq(approvalRequests.action, tuple.action),
    sql`${approvalRequests.vendor} IS NOT DISTINCT FROM ${tuple.vendor ?? null}`,
    sql`${approvalRequests.amount} IS NOT DISTINCT FROM ${toAmount(tuple.amount)}`,
    sql`${approvalRequests.argumentFingerprint} IS NOT DISTINCT FROM ${tuple.argumentFingerprint ?? null}`,
    eq(approvalRequests.status, "pending"),
    eq(approvalRequests.kind, "agent_action")
  );
}

export async function consumeApprovedAgentGrant(
  db: BehalfPostgresDb,
  tuple: AgentApprovalTuple,
  now: Date
): Promise<ApprovalRecord | null> {
  const [row] = await db
    .update(approvalRequests)
    .set({ status: "used", usedAt: now })
    .where(
      and(
        eq(approvalRequests.agentId, tuple.agentId),
        eq(approvalRequests.permissionId, tuple.permissionId),
        eq(approvalRequests.action, tuple.action),
        sql`${approvalRequests.vendor} IS NOT DISTINCT FROM ${tuple.vendor ?? null}`,
        sql`${approvalRequests.amount} IS NOT DISTINCT FROM ${toAmount(tuple.amount)}`,
        sql`${approvalRequests.argumentFingerprint} IS NOT DISTINCT FROM ${
          tuple.argumentFingerprint ?? null
        }`,
        eq(approvalRequests.status, "approved"),
        gt(approvalRequests.grantExpiresAt, now)
      )
    )
    .returning();

  return row ? toRecord(row) : null;
}

export async function upsertPendingAgentApproval(
  db: BehalfPostgresDb,
  tuple: AgentApprovalTuple,
  setOnInsert: {
    approvalId: string;
    requestId: string;
    accountId?: string | null;
    developerUserId?: string | null;
    requiredAuthorityLevel?: number | null;
    argumentKind?: string | null;
    argumentPreview?: string | null;
    argumentPreviewTruncated?: boolean | null;
  }
): Promise<ApprovalRecord> {
  const existing = await db.query.approvalRequests.findFirst({
    where: agentPendingWhere(tuple)
  });
  if (existing) {
    return toRecord(existing);
  }

  try {
    const [inserted] = await db
      .insert(approvalRequests)
      .values({
        approvalId: setOnInsert.approvalId,
        requestId: setOnInsert.requestId,
        accountId: setOnInsert.accountId ?? null,
        developerUserId: setOnInsert.developerUserId ?? null,
        kind: "agent_action",
        agentId: tuple.agentId,
        permissionId: tuple.permissionId,
        action: tuple.action,
        vendor: tuple.vendor ?? null,
        amount: toAmount(tuple.amount),
        argumentFingerprint: tuple.argumentFingerprint ?? null,
        argumentKind: setOnInsert.argumentKind ?? null,
        argumentPreview: setOnInsert.argumentPreview ?? null,
        argumentPreviewTruncated: setOnInsert.argumentPreviewTruncated ?? null,
        requiredAuthorityLevel: setOnInsert.requiredAuthorityLevel ?? null,
        status: "pending"
      })
      .returning();

    if (inserted) {
      return toRecord(inserted);
    }
  } catch (error) {
    // Concurrent insert raced the partial unique index — fall through to select.
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      (error as { code?: string }).code !== "23505"
    ) {
      throw error;
    }
  }

  const pending = await db.query.approvalRequests.findFirst({
    where: agentPendingWhere(tuple)
  });
  if (!pending) {
    throw new Error("Failed to upsert pending agent approval");
  }
  return toRecord(pending);
}

export async function findApprovalById(db: BehalfPostgresDb, approvalId: string) {
  const row =
    (await db.query.approvalRequests.findFirst({
      where: eq(approvalRequests.approvalId, approvalId)
    })) ?? null;
  return row ? toRecord(row) : null;
}

export async function approveAgentGrant(
  db: BehalfPostgresDb,
  approvalId: string,
  grantExpiresAt: Date,
  resolvedBy?: string
) {
  const [row] = await db
    .update(approvalRequests)
    .set({
      status: "approved",
      grantExpiresAt,
      resolvedAt: new Date(),
      resolvedBy: resolvedBy ?? null
    })
    .where(and(eq(approvalRequests.approvalId, approvalId), eq(approvalRequests.status, "pending")))
    .returning();

  return row ? toRecord(row) : null;
}
