import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { approvalRequests } from "@/lib/db/postgres/schema";
import type {
  ApprovalScope,
  ApprovedGrantTuple
} from "@/lib/repositories/approvals";
import {
  isRetryablePostgresError,
  translatePostgresError
} from "@/lib/repositories/errors";

export { APPROVAL_GRANT_TTL_MS } from "@/lib/repositories/mongo/approvals";

type ApprovalRow = typeof approvalRequests.$inferSelect;
type ApprovalInsert = typeof approvalRequests.$inferInsert;
type ApprovalUpdate = Partial<ApprovalInsert>;

export type ApprovalDomain = {
  approvalId: string;
  requestId: string;
  accountId: string | null;
  developerUserId: string | null;
  kind: string;
  agentId: string | null;
  permissionId: string | null;
  action: string;
  vendor: string | null;
  amount: number | null;
  argumentKind: string | null;
  argumentFingerprint: string | null;
  argumentPreview: string | null;
  argumentPreviewTruncated: boolean | null;
  pauseTool: string | null;
  pauseRepo: string | null;
  pauseBranch: string | null;
  pauseDeviceId: string | null;
  pauseScope: string | null;
  requestedDurationMinutes: number | null;
  pauseReason: string | null;
  contextReason: string | null;
  status: string;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  usedAt: Date | null;
  grantExpiresAt: Date | null;
  requiredAuthorityLevel: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ApprovalFindOptions = {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  select?: string;
};

const columns: Record<string, AnyPgColumn> = {
  approvalId: approvalRequests.approvalId,
  requestId: approvalRequests.requestId,
  accountId: approvalRequests.accountId,
  developerUserId: approvalRequests.developerUserId,
  kind: approvalRequests.kind,
  agentId: approvalRequests.agentId,
  permissionId: approvalRequests.permissionId,
  action: approvalRequests.action,
  vendor: approvalRequests.vendor,
  amount: approvalRequests.amount,
  argumentKind: approvalRequests.argumentKind,
  argumentFingerprint: approvalRequests.argumentFingerprint,
  argumentPreview: approvalRequests.argumentPreview,
  argumentPreviewTruncated: approvalRequests.argumentPreviewTruncated,
  pauseTool: approvalRequests.pauseTool,
  pauseRepo: approvalRequests.pauseRepo,
  pauseBranch: approvalRequests.pauseBranch,
  pauseDeviceId: approvalRequests.pauseDeviceId,
  pauseScope: approvalRequests.pauseScope,
  requestedDurationMinutes: approvalRequests.requestedDurationMinutes,
  pauseReason: approvalRequests.pauseReason,
  contextReason: approvalRequests.contextReason,
  status: approvalRequests.status,
  resolvedBy: approvalRequests.resolvedBy,
  resolvedAt: approvalRequests.resolvedAt,
  usedAt: approvalRequests.usedAt,
  grantExpiresAt: approvalRequests.grantExpiresAt,
  requiredAuthorityLevel: approvalRequests.requiredAuthorityLevel,
  createdAt: approvalRequests.createdAt,
  updatedAt: approvalRequests.updatedAt
};

function columnFor(key: string) {
  const column = columns[key];
  if (!column) throw new Error(`Unsupported approval field: ${key}`);
  return column;
}

function fieldCondition(key: string, value: unknown): SQL {
  const column = columnFor(key);
  if (value === null || value === undefined) return isNull(column);
  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    const conditions = Object.entries(value as Record<string, unknown>).map(
      ([operator, operand]) => {
        switch (operator) {
          case "$in":
            return inArray(column, operand as unknown[]);
          case "$nin":
            return notInArray(column, operand as unknown[]);
          case "$ne":
            return operand === null
              ? or(ne(column, operand), isNull(column))!
              : ne(column, operand);
          case "$gt":
            return gt(column, operand);
          case "$gte":
            return gte(column, operand);
          case "$lt":
            return lt(column, operand);
          case "$lte":
            return lte(column, operand);
          default:
            throw new Error(`Unsupported approval filter operator: ${operator}`);
        }
      }
    );
    return and(...conditions)!;
  }
  return eq(column, value);
}

function buildWhere(filter: Record<string, unknown> = {}): SQL | undefined {
  const conditions: SQL[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$or" || key === "$and") {
      const nested = (value as Record<string, unknown>[])
        .map(buildWhere)
        .filter(Boolean) as SQL[];
      if (nested.length) {
        conditions.push((key === "$or" ? or(...nested) : and(...nested))!);
      }
      continue;
    }
    conditions.push(fieldCondition(key, value));
  }
  return conditions.length ? and(...conditions) : undefined;
}

function normalizeAmount(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === "number" ? value : Number(value);
}

export function normalizeApproval(row: ApprovalRow): ApprovalDomain {
  return {
    approvalId: row.approvalId,
    requestId: row.requestId,
    accountId: row.accountId,
    developerUserId: row.developerUserId,
    kind: row.kind,
    agentId: row.agentId,
    permissionId: row.permissionId,
    action: row.action,
    vendor: row.vendor,
    amount: normalizeAmount(row.amount),
    argumentKind: row.argumentKind,
    argumentFingerprint: row.argumentFingerprint,
    argumentPreview: row.argumentPreview,
    argumentPreviewTruncated: row.argumentPreviewTruncated,
    pauseTool: row.pauseTool,
    pauseRepo: row.pauseRepo,
    pauseBranch: row.pauseBranch,
    pauseDeviceId: row.pauseDeviceId,
    pauseScope: row.pauseScope,
    requestedDurationMinutes: row.requestedDurationMinutes,
    pauseReason: row.pauseReason,
    contextReason: row.contextReason,
    status: row.status,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
    usedAt: row.usedAt,
    grantExpiresAt: row.grantExpiresAt,
    requiredAuthorityLevel: row.requiredAuthorityLevel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function equalityValues(filter: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filter).filter(
      ([key, value]) =>
        !key.startsWith("$") &&
        (!value || typeof value !== "object" || value instanceof Date || Array.isArray(value))
    )
  );
}

function insertValues(
  filter: Record<string, unknown>,
  setOnInsert: Record<string, unknown>
): ApprovalInsert {
  return {
    ...equalityValues(filter),
    ...setOnInsert
  } as ApprovalInsert;
}

function updateValues(update: Record<string, unknown>): ApprovalUpdate {
  const source =
    update.$set && typeof update.$set === "object"
      ? (update.$set as Record<string, unknown>)
      : Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$")));
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!columns[key] || key === "approvalId" || key === "createdAt") {
      if (!columns[key]) throw new Error(`Unsupported approval update field: ${key}`);
      continue;
    }
    values[key] = value;
  }
  if (update.$unset && typeof update.$unset === "object") {
    for (const key of Object.keys(update.$unset as Record<string, unknown>)) {
      if (!columns[key]) throw new Error(`Unsupported approval update field: ${key}`);
      values[key] = null;
    }
  }
  return { ...values, updatedAt: new Date() } as ApprovalUpdate;
}

function orderByFrom(sort: Record<string, 1 | -1>) {
  return Object.entries(sort).map(([key, direction]) =>
    direction === -1 ? desc(columnFor(key)) : asc(columnFor(key))
  );
}

function projectApproval(row: ApprovalDomain, select?: string): ApprovalDomain {
  if (!select) return row;
  const tokens = select.trim().split(/\s+/).filter(Boolean);
  const included = tokens.filter((token) => !token.startsWith("-"));
  if (!included.length) {
    const excluded = new Set(tokens.map((token) => token.replace(/^-/, "")));
    return Object.fromEntries(
      Object.entries(row).filter(([key]) => !excluded.has(key))
    ) as ApprovalDomain;
  }
  return Object.fromEntries(
    included
      .filter((key) => key !== "_id" && key in row)
      .map((key) => [key, row[key as keyof ApprovalDomain]])
  ) as ApprovalDomain;
}

async function withSafeIdempotentRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryablePostgresError(error) || attempt === 2) {
        translatePostgresError(error);
      }
    }
  }
  throw new Error("Unreachable approval retry state");
}

export async function upsertPendingAgentAction(
  db: BehalfPostgresDb,
  pendingFilter: Record<string, unknown>,
  setOnInsert: Record<string, unknown>
) {
  const values = {
    ...insertValues(pendingFilter, setOnInsert),
    kind: "agent_action",
    status: "pending"
  } as ApprovalInsert;

  return withSafeIdempotentRetry(async () => {
    try {
      const [row] = await db
        .insert(approvalRequests)
        .values(values)
        .onConflictDoUpdate({
          target: [
            approvalRequests.agentId,
            approvalRequests.permissionId,
            approvalRequests.action,
            approvalRequests.vendor,
            approvalRequests.amount,
            approvalRequests.argumentFingerprint
          ],
          targetWhere: and(
            sql`${approvalRequests.status} = 'pending'`,
            sql`${approvalRequests.kind} = 'agent_action'`
          ),
          set: { updatedAt: sql`${approvalRequests.updatedAt}` }
        })
        .returning();
      return row ? normalizeApproval(row) : null;
    } catch (error) {
      if (isRetryablePostgresError(error)) throw error;
      translatePostgresError(error);
    }
  });
}

/**
 * Mongo has only a non-unique lookup index for pause tuples. Its upsert can
 * create concurrent duplicates, so this transaction intentionally serializes
 * neither the tuple nor the table and preserves that behavior.
 */
export async function upsertPendingManagedProfilePause(
  db: BehalfPostgresDb,
  pendingFilter: Record<string, unknown>,
  setOnInsert: Record<string, unknown>
) {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(approvalRequests)
        .where(buildWhere(pendingFilter))
        .limit(1);
      if (existing) return normalizeApproval(existing);

      const [inserted] = await tx
        .insert(approvalRequests)
        .values({
          ...insertValues(pendingFilter, setOnInsert),
          kind: "managed_profile_pause",
          status: "pending"
        } as ApprovalInsert)
        .returning();
      return inserted ? normalizeApproval(inserted) : null;
    });
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findApprovalLean(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  select?: string
) {
  const [row] = await db.select().from(approvalRequests).where(buildWhere(filter)).limit(1);
  return row ? projectApproval(normalizeApproval(row), select) : null;
}

export const findApproval = findApprovalLean;
export const findOneApproval = findApprovalLean;

export async function listApprovals(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  options: ApprovalFindOptions = {}
) {
  let query = db
    .select()
    .from(approvalRequests)
    .where(buildWhere(filter))
    .$dynamic();
  const ordering = orderByFrom(options.sort ?? { createdAt: -1 });
  if (ordering.length) query = query.orderBy(...ordering);
  if (options.skip !== undefined) query = query.offset(options.skip);
  if (options.limit !== undefined) query = query.limit(options.limit);
  return (await query).map((row) => projectApproval(normalizeApproval(row), options.select));
}

export function findApprovals(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {},
  options: ApprovalFindOptions = {}
) {
  return listApprovals(db, filter, { ...options, sort: options.sort ?? {} });
}

export async function consumeApprovedGrant(
  db: BehalfPostgresDb,
  tuple: ApprovedGrantTuple,
  now = new Date()
) {
  try {
    const [row] = await db
      .update(approvalRequests)
      .set({ status: "used", usedAt: now, updatedAt: now })
      .where(
        and(
          eq(approvalRequests.kind, "agent_action"),
          eq(approvalRequests.agentId, tuple.agentId),
          eq(approvalRequests.permissionId, tuple.permissionId),
          eq(approvalRequests.action, tuple.action),
          tuple.vendor === null
            ? isNull(approvalRequests.vendor)
            : eq(approvalRequests.vendor, tuple.vendor),
          tuple.amount === null
            ? isNull(approvalRequests.amount)
            : eq(approvalRequests.amount, String(tuple.amount)),
          tuple.argumentFingerprint === null
            ? isNull(approvalRequests.argumentFingerprint)
            : eq(approvalRequests.argumentFingerprint, tuple.argumentFingerprint),
          eq(approvalRequests.status, "approved"),
          gt(approvalRequests.grantExpiresAt, now),
          isNull(approvalRequests.usedAt)
        )
      )
      .returning();
    if (!row) return null;
    return normalizeApproval({ ...row, status: "approved", usedAt: null });
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function approveApproval(
  db: BehalfPostgresDb,
  approvalId: string,
  scope: ApprovalScope,
  resolvedBy: string,
  grantExpiresAt: Date,
  now = new Date()
) {
  return updateApproval(
    db,
    { ...scope, approvalId, status: "pending" },
    { $set: { status: "approved", resolvedBy, resolvedAt: now, grantExpiresAt } }
  );
}

export async function denyApproval(
  db: BehalfPostgresDb,
  approvalId: string,
  scope: ApprovalScope,
  resolvedBy: string,
  now = new Date()
) {
  return updateApproval(
    db,
    { ...scope, approvalId, status: "pending" },
    { $set: { status: "denied", resolvedBy, resolvedAt: now } }
  );
}

export async function updateApproval(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  try {
    const target = db
      .select({ approvalId: approvalRequests.approvalId })
      .from(approvalRequests)
      .where(buildWhere(filter))
      .limit(1);
    const rows = await db
      .update(approvalRequests)
      .set(updateValues(update))
      .where(inArray(approvalRequests.approvalId, target))
      .returning({ approvalId: approvalRequests.approvalId });
    return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function consumeApprovedPauseApproval(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  now = new Date()
) {
  return updateApproval(
    db,
    {
      ...filter,
      kind: "managed_profile_pause",
      status: "approved",
      grantExpiresAt: { $gt: now },
      usedAt: null
    },
    { $set: { status: "used", resolvedAt: now } }
  );
}

export async function deleteApprovals(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) {
  try {
    const rows = await db
      .delete(approvalRequests)
      .where(buildWhere(filter))
      .returning({ approvalId: approvalRequests.approvalId });
    return { acknowledged: true, deletedCount: rows.length };
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function countApprovals(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
) {
  const [row] = await db
    .select({ value: count() })
    .from(approvalRequests)
    .where(buildWhere(filter));
  return row?.value ?? 0;
}

export function createPostgresApprovalRepository(db: BehalfPostgresDb) {
  return {
    consumeApprovedGrant: (tuple: ApprovedGrantTuple, now?: Date) =>
      consumeApprovedGrant(db, tuple, now),
    upsertPendingAgentAction: (
      pendingFilter: Record<string, unknown>,
      setOnInsert: Record<string, unknown>
    ) => upsertPendingAgentAction(db, pendingFilter, setOnInsert),
    upsertPendingManagedProfilePause: (
      pendingFilter: Record<string, unknown>,
      setOnInsert: Record<string, unknown>
    ) => upsertPendingManagedProfilePause(db, pendingFilter, setOnInsert),
    findOne: (filter: Record<string, unknown>, select?: string) =>
      findOneApproval(db, filter, select),
    findOneLean: (filter: Record<string, unknown>, select?: string) =>
      findApprovalLean(db, filter, select),
    find: (filter?: Record<string, unknown>, options?: ApprovalFindOptions) =>
      findApprovals(db, filter, options),
    list: (filter: Record<string, unknown>, options?: ApprovalFindOptions) =>
      listApprovals(db, filter, options),
    approve: (
      approvalId: string,
      scope: ApprovalScope,
      resolvedBy: string,
      grantExpiresAt: Date,
      now?: Date
    ) => approveApproval(db, approvalId, scope, resolvedBy, grantExpiresAt, now),
    deny: (approvalId: string, scope: ApprovalScope, resolvedBy: string, now?: Date) =>
      denyApproval(db, approvalId, scope, resolvedBy, now),
    consumeApprovedPauseApproval: (filter: Record<string, unknown>, now?: Date) =>
      consumeApprovedPauseApproval(db, filter, now),
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
      updateApproval(db, filter, update),
    deleteMany: (filter: Record<string, unknown>) => deleteApprovals(db, filter),
    countDocuments: (filter?: Record<string, unknown>) => countApprovals(db, filter)
  };
}

export type PostgresApprovalRepository = ReturnType<typeof createPostgresApprovalRepository>;
