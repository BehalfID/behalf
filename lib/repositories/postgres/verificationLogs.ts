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
import { agents, verificationLogs } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";

type VerificationLogRow = typeof verificationLogs.$inferSelect;
type VerificationLogInsert = typeof verificationLogs.$inferInsert;
type VerificationLogUpdate = Partial<VerificationLogInsert>;

export type VerificationLogDomain = {
  logId: string;
  requestId: string;
  accountId: string | null;
  developerUserId: string | null;
  agentId: string;
  permissionId: string | null;
  action: string;
  amount: number | null;
  vendor: string | null;
  allowed: boolean;
  approvalRequired: boolean;
  reason: string;
  risk: string;
  metadata: Record<string, unknown> | null;
  shadow: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type VerificationLogFindOptions = {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  select?: string;
};

export type AggregateStats = {
  total: number;
  allowed: number;
  denied: number;
  highRisk: number;
  approvalRequired: number;
  topDeniedAction: string | null;
  topVendor: string | null;
};

const columns: Record<string, AnyPgColumn> = {
  logId: verificationLogs.logId,
  requestId: verificationLogs.requestId,
  accountId: verificationLogs.accountId,
  developerUserId: verificationLogs.developerUserId,
  agentId: verificationLogs.agentId,
  permissionId: verificationLogs.permissionId,
  action: verificationLogs.action,
  amount: verificationLogs.amount,
  vendor: verificationLogs.vendor,
  allowed: verificationLogs.allowed,
  approvalRequired: verificationLogs.approvalRequired,
  reason: verificationLogs.reason,
  risk: verificationLogs.risk,
  metadata: verificationLogs.metadata,
  shadow: verificationLogs.shadow,
  createdAt: verificationLogs.createdAt,
  updatedAt: verificationLogs.updatedAt
};

function columnFor(key: string) {
  const column = columns[key];
  if (!column) throw new Error(`Unsupported verification log field: ${key}`);
  return column;
}

function normalizeAmount(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function normalizeVerificationLog(row: VerificationLogRow): VerificationLogDomain {
  return {
    logId: row.logId,
    requestId: row.requestId,
    accountId: row.accountId,
    developerUserId: row.developerUserId,
    agentId: row.agentId,
    permissionId: row.permissionId,
    action: row.action,
    amount: normalizeAmount(row.amount),
    vendor: row.vendor,
    allowed: row.allowed,
    approvalRequired: row.approvalRequired,
    reason: row.reason,
    risk: row.risk,
    metadata: normalizeMetadata(row.metadata),
    shadow: row.shadow,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function projectLog(row: VerificationLogDomain, select?: string): Partial<VerificationLogDomain> {
  if (!select) return row;
  const tokens = select.trim().split(/\s+/).filter(Boolean);
  const included = tokens.filter((token) => !token.startsWith("-"));
  if (!included.length) {
    const excluded = new Set(tokens.map((token) => token.replace(/^-/, "")));
    return Object.fromEntries(
      Object.entries(row).filter(([key]) => !excluded.has(key))
    ) as Partial<VerificationLogDomain>;
  }
  return Object.fromEntries(
    included
      .filter((key) => key !== "_id" && key in row)
      .map((key) => [key, row[key as keyof VerificationLogDomain]])
  ) as Partial<VerificationLogDomain>;
}

function regexCondition(expression: SQL, pattern: RegExp): SQL {
  const operator = pattern.flags.includes("i") ? "~*" : "~";
  return sql`${expression} ${sql.raw(operator)} ${pattern.source}`;
}

function metadataPathExpression(path: string): SQL {
  const parts = path.split(".");
  if (parts[0] !== "metadata" || parts.length < 2) {
    throw new Error(`Unsupported verification log metadata path: ${path}`);
  }
  let expression: SQL = sql`${verificationLogs.metadata}`;
  for (let index = 1; index < parts.length; index += 1) {
    const key = parts[index]!;
    expression =
      index === parts.length - 1
        ? sql`(${expression}->>${key})`
        : sql`(${expression}->${key})`;
  }
  return expression;
}

function fieldCondition(key: string, value: unknown): SQL {
  if (key.includes(".")) {
    const expression = metadataPathExpression(key);
    if (value instanceof RegExp) return regexCondition(expression, value);
    if (value === null || value === undefined) return sql`${expression} IS NULL`;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      return operatorCondition(expression, value as Record<string, unknown>);
    }
    return sql`${expression} = ${value}`;
  }

  const column = columnFor(key);
  if (value instanceof RegExp) return regexCondition(sql`${column}`, value);
  if (value === null || value === undefined) return isNull(column);

  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    const operators = value as Record<string, unknown>;
    const conditions = Object.entries(operators).map(([operator, operand]) => {
      switch (operator) {
        case "$in":
          return inArray(column, operand as unknown[]);
        case "$nin":
          return notInArray(column, operand as unknown[]);
        case "$ne":
          return operand === null ? sql`${column} IS NOT NULL` : ne(column, operand);
        case "$gt":
          return gt(column, operand);
        case "$gte":
          return gte(column, operand);
        case "$lt":
          return lt(column, operand);
        case "$lte":
          return lte(column, operand);
        case "$exists":
          return operand ? sql`${column} IS NOT NULL` : isNull(column);
        case "$regex": {
          const flags = typeof operators.$options === "string" ? operators.$options : "";
          const source = String(operand);
          return flags.includes("i")
            ? sql`${column} ~* ${source}`
            : sql`${column} ~ ${source}`;
        }
        case "$options":
          return sql`true`;
        default:
          throw new Error(`Unsupported verification log filter operator: ${operator}`);
      }
    });
    return and(...conditions)!;
  }

  return eq(column, value);
}

function operatorCondition(expression: SQL, operators: Record<string, unknown>): SQL {
  const conditions = Object.entries(operators).map(([operator, operand]) => {
    switch (operator) {
      case "$in":
        return sql`${expression} = ANY(${operand as unknown[]})`;
      case "$nin":
        return sql`${expression} <> ALL(${operand as unknown[]})`;
      case "$ne":
        return operand === null
          ? sql`${expression} IS NOT NULL`
          : sql`${expression} IS DISTINCT FROM ${operand}`;
      case "$gt":
        return sql`${expression} > ${operand}`;
      case "$gte":
        return sql`${expression} >= ${operand}`;
      case "$lt":
        return sql`${expression} < ${operand}`;
      case "$lte":
        return sql`${expression} <= ${operand}`;
      case "$exists":
        return operand ? sql`${expression} IS NOT NULL` : sql`${expression} IS NULL`;
      case "$regex": {
        const flags = typeof operators.$options === "string" ? operators.$options : "";
        const source = String(operand);
        return flags.includes("i")
          ? sql`${expression} ~* ${source}`
          : sql`${expression} ~ ${source}`;
      }
      case "$options":
        return sql`true`;
      default:
        throw new Error(`Unsupported verification log filter operator: ${operator}`);
    }
  });
  return and(...conditions)!;
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

function orderByFrom(sort: Record<string, 1 | -1>) {
  const entries = Object.entries(sort);
  const ordering = entries.map(([key, direction]) =>
    direction === -1 ? desc(columnFor(key)) : asc(columnFor(key))
  );
  // Stable descending pagination: created_at DESC, log_id DESC
  if (entries.length === 1 && entries[0]?.[0] === "createdAt" && entries[0]?.[1] === -1) {
    ordering.push(desc(verificationLogs.logId));
  }
  return ordering;
}

function insertValues(input: Record<string, unknown>): VerificationLogInsert {
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!columns[key]) {
      throw new Error(`Unsupported verification log insert field: ${key}`);
    }
    values[key] = value;
  }
  if (values.amount !== undefined && values.amount !== null && typeof values.amount === "number") {
    values.amount = String(values.amount);
  }
  return values as VerificationLogInsert;
}

function updateValues(update: Record<string, unknown>): VerificationLogUpdate {
  const source =
    update.$set && typeof update.$set === "object"
      ? (update.$set as Record<string, unknown>)
      : Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$")));
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!columns[key] || key === "logId" || key === "createdAt") {
      if (!columns[key]) throw new Error(`Unsupported verification log update field: ${key}`);
      continue;
    }
    values[key] = key === "amount" && typeof value === "number" ? String(value) : value;
  }
  if (update.$unset && typeof update.$unset === "object") {
    for (const key of Object.keys(update.$unset as Record<string, unknown>)) {
      if (!columns[key] || key === "logId" || key === "createdAt") {
        throw new Error(`Unsupported verification log update field: ${key}`);
      }
      values[key] = null;
    }
  }
  return { ...values, updatedAt: new Date() } as VerificationLogUpdate;
}

function translatePartitionError(error: unknown): never {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  if (/no partition of relation .*verification_logs/i.test(message)) {
    throw new Error(
      "verification_logs partition is missing for this createdAt. Run behalf_ensure_verification_log_partitions before inserting.",
      { cause: error }
    );
  }
  translatePostgresError(error);
}

export async function createLog(db: BehalfPostgresDb, input: Record<string, unknown>) {
  try {
    const values = insertValues(input);
    // Preserve caller-provided createdAt; do not replace with database time.
    const [row] = await db.insert(verificationLogs).values(values).returning();
    if (!row) throw new Error("createLog failed to return a row");
    return normalizeVerificationLog(row);
  } catch (error) {
    translatePartitionError(error);
  }
}

export async function findLogs(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {},
  options: VerificationLogFindOptions = {}
) {
  try {
    let query = db.select().from(verificationLogs).where(buildWhere(filter)).$dynamic();
    const ordering = orderByFrom(options.sort ?? { createdAt: -1 });
    if (ordering.length) query = query.orderBy(...ordering);
    if (options.skip !== undefined) query = query.offset(options.skip);
    if (options.limit !== undefined) query = query.limit(options.limit);
    return (await query).map((row) => projectLog(normalizeVerificationLog(row), options.select));
  } catch (error) {
    translatePostgresError(error);
  }
}

export function findVerificationLogs(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {},
  options: VerificationLogFindOptions = {}
) {
  return findLogs(db, filter, options);
}

export async function findOneLog(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  options: VerificationLogFindOptions = {}
) {
  const rows = await findLogs(db, filter, { ...options, limit: 1 });
  return rows[0] ?? null;
}

export const findOneVerificationLog = findOneLog;

export async function countLogs(db: BehalfPostgresDb, filter: Record<string, unknown> = {}) {
  try {
    const [row] = await db
      .select({ value: count() })
      .from(verificationLogs)
      .where(buildWhere(filter));
    return row?.value ?? 0;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function aggregateStats(
  db: BehalfPostgresDb,
  query: Record<string, unknown>,
  limit = 1000
): Promise<AggregateStats | null> {
  try {
    const where = buildWhere(query);
    const limited = db
      .select({
        action: verificationLogs.action,
        vendor: verificationLogs.vendor,
        allowed: verificationLogs.allowed,
        approvalRequired: verificationLogs.approvalRequired,
        risk: verificationLogs.risk,
        reason: verificationLogs.reason
      })
      .from(verificationLogs)
      .where(where)
      .orderBy(desc(verificationLogs.createdAt), desc(verificationLogs.logId))
      .limit(limit)
      .as("recent_logs");

    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        allowed: sql<number>`count(*) FILTER (WHERE ${limited.allowed})::int`,
        denied: sql<number>`count(*) FILTER (WHERE NOT ${limited.allowed})::int`,
        highRisk: sql<number>`count(*) FILTER (WHERE ${limited.risk} = 'high')::int`,
        approvalRequired: sql<number>`count(*) FILTER (
          WHERE ${limited.approvalRequired}
             OR ${limited.reason} ~* 'requires approval|approval required|approval before execution'
        )::int`
      })
      .from(limited);

    const [topDenied] = await db
      .select({
        action: limited.action,
        value: sql<number>`count(*)::int`
      })
      .from(limited)
      .where(eq(limited.allowed, false))
      .groupBy(limited.action)
      .orderBy(sql`count(*) DESC`)
      .limit(1);

    const [topVendor] = await db
      .select({
        vendor: limited.vendor,
        value: sql<number>`count(*)::int`
      })
      .from(limited)
      .where(sql`${limited.vendor} IS NOT NULL`)
      .groupBy(limited.vendor)
      .orderBy(sql`count(*) DESC`)
      .limit(1);

    return {
      total: stats?.total ?? 0,
      allowed: stats?.allowed ?? 0,
      denied: stats?.denied ?? 0,
      highRisk: stats?.highRisk ?? 0,
      approvalRequired: stats?.approvalRequired ?? 0,
      topDeniedAction: topDenied?.action ?? null,
      topVendor: topVendor?.vendor ?? null
    };
  } catch {
    return null;
  }
}

/**
 * Supports the console daily-activity pipeline shape used by Mongo callers.
 * Arbitrary Mongo pipelines are rejected rather than silently approximated.
 */
export async function aggregateVerificationLogs(
  db: BehalfPostgresDb,
  pipeline: Array<Record<string, unknown>>
) {
  const match = pipeline[0]?.$match as Record<string, unknown> | undefined;
  const group = pipeline[1]?.$group as Record<string, unknown> | undefined;
  const sort = pipeline[2]?.$sort as Record<string, unknown> | undefined;
  const groupId = group?._id as Record<string, unknown> | undefined;
  const dateToString = groupId?.$dateToString as { format?: string; date?: string } | undefined;

  const isDailyActivity =
    pipeline.length === 3 &&
    Boolean(match) &&
    Boolean(group) &&
    sort?._id === 1 &&
    dateToString?.format === "%Y-%m-%d" &&
    dateToString?.date === "$createdAt";

  if (!isDailyActivity) {
    throw new Error(
      "PostgreSQL verificationLogs.aggregate only supports the console daily-activity pipeline. Use aggregateStats for dashboard summaries."
    );
  }

  try {
    const rows = await db
      .select({
        _id: sql<string>`to_char(${verificationLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        total: sql<number>`count(*)::int`,
        allowed: sql<number>`count(*) FILTER (WHERE ${verificationLogs.allowed})::int`,
        denied: sql<number>`count(*) FILTER (WHERE NOT ${verificationLogs.allowed})::int`
      })
      .from(verificationLogs)
      .where(buildWhere(match!))
      .groupBy(sql`to_char(${verificationLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${verificationLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD') ASC`);
    return rows;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findAgentNames(
  db: BehalfPostgresDb,
  agentIds: string[],
  scope: { developerUserId?: string; accountId?: string }
) {
  if (!agentIds.length) return [];
  const conditions: SQL[] = [inArray(agents.agentId, agentIds)];
  if (scope.developerUserId) conditions.push(eq(agents.developerUserId, scope.developerUserId));
  if (scope.accountId) conditions.push(eq(agents.accountId, scope.accountId));
  try {
    return await db
      .select({ agentId: agents.agentId, name: agents.name })
      .from(agents)
      .where(and(...conditions));
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function updateLogs(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  try {
    const rows = await db
      .update(verificationLogs)
      .set(updateValues(update))
      .where(buildWhere(filter))
      .returning({ logId: verificationLogs.logId });
    return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function deleteLogs(db: BehalfPostgresDb, filter: Record<string, unknown>) {
  try {
    const rows = await db
      .delete(verificationLogs)
      .where(buildWhere(filter))
      .returning({ logId: verificationLogs.logId });
    return { acknowledged: true, deletedCount: rows.length };
  } catch (error) {
    translatePostgresError(error);
  }
}

export function createPostgresVerificationLogRepository(db: BehalfPostgresDb) {
  return {
    createLog: (input: Record<string, unknown>) => createLog(db, input),
    find: (filter?: Record<string, unknown>, options?: VerificationLogFindOptions) =>
      findVerificationLogs(db, filter, options),
    findOne: (filter: Record<string, unknown>, options?: VerificationLogFindOptions) =>
      findOneVerificationLog(db, filter, options),
    countDocuments: (filter?: Record<string, unknown>) => countLogs(db, filter),
    aggregate: (pipeline: Array<Record<string, unknown>>) =>
      aggregateVerificationLogs(db, pipeline),
    aggregateStats: (query: Record<string, unknown>, limit?: number) =>
      aggregateStats(db, query, limit),
    findAgentNames: (
      agentIds: string[],
      scope: { developerUserId?: string; accountId?: string }
    ) => findAgentNames(db, agentIds, scope),
    updateMany: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
      updateLogs(db, filter, update),
    deleteMany: (filter: Record<string, unknown>) => deleteLogs(db, filter)
  };
}

export type PostgresVerificationLogRepository = ReturnType<
  typeof createPostgresVerificationLogRepository
>;
