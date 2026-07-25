import {
  and,
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
  type SQL
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { deviceCodes } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreateDeviceCodeInput,
  DeviceCodeLean,
  DeviceCodeStatus
} from "@/lib/repositories/deviceCodes";

type DeviceCodeRow = typeof deviceCodes.$inferSelect;
type DeviceCodeInsert = typeof deviceCodes.$inferInsert;

const columns: Record<string, AnyPgColumn> = {
  codeId: deviceCodes.codeId,
  deviceCode: deviceCodes.deviceCode,
  userCode: deviceCodes.userCode,
  status: deviceCodes.status,
  userId: deviceCodes.userId,
  sessionToken: deviceCodes.sessionToken,
  expiresAt: deviceCodes.expiresAt,
  createdAt: deviceCodes.createdAt
};

function columnFor(key: string) {
  const column = columns[key];
  if (!column) throw new Error(`Unsupported device code filter field: ${key}`);
  return column;
}

function fieldCondition(key: string, value: unknown): SQL {
  const column = columnFor(key);
  if (value === null) return isNull(column);

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
            throw new Error(`Unsupported device code filter operator: ${operator}`);
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
    if (key === "$or") {
      const alternatives = (value as Record<string, unknown>[]).map(buildWhere).filter(Boolean) as SQL[];
      if (alternatives.length) conditions.push(or(...alternatives)!);
      continue;
    }
    if (key === "$and") {
      const conjunctions = (value as Record<string, unknown>[]).map(buildWhere).filter(Boolean) as SQL[];
      if (conjunctions.length) conditions.push(and(...conjunctions)!);
      continue;
    }
    conditions.push(fieldCondition(key, value));
  }
  return conditions.length ? and(...conditions) : undefined;
}

function toLean(row: DeviceCodeRow): DeviceCodeLean {
  return {
    codeId: row.codeId,
    deviceCode: row.deviceCode,
    userCode: row.userCode,
    status: row.status as DeviceCodeStatus,
    userId: row.userId,
    sessionToken: row.sessionToken,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt
  };
}

export async function createDeviceCode(
  db: BehalfPostgresDb,
  input: CreateDeviceCodeInput
): Promise<DeviceCodeLean> {
  try {
    const [row] = await db
      .insert(deviceCodes)
      .values({
        codeId: input.codeId,
        deviceCode: input.deviceCode,
        userCode: input.userCode,
        status: input.status ?? "pending",
        userId: input.userId ?? null,
        sessionToken: input.sessionToken ?? null,
        expiresAt: input.expiresAt
      })
      .returning();
    if (!row) throw new Error("createDeviceCode failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findByDeviceCode(
  db: BehalfPostgresDb,
  deviceCode: string
): Promise<DeviceCodeLean | null> {
  const row =
    (await db.query.deviceCodes.findFirst({
      where: eq(deviceCodes.deviceCode, deviceCode)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findByUserCode(
  db: BehalfPostgresDb,
  userCode: string,
  status?: DeviceCodeStatus
): Promise<DeviceCodeLean | null> {
  const row =
    (await db.query.deviceCodes.findFirst({
      where: status
        ? and(eq(deviceCodes.userCode, userCode), eq(deviceCodes.status, status))
        : eq(deviceCodes.userCode, userCode)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findOneAndDeleteAuthorized(
  db: BehalfPostgresDb,
  deviceCode: string
): Promise<DeviceCodeLean | null> {
  const rows = await db
    .delete(deviceCodes)
    .where(and(eq(deviceCodes.deviceCode, deviceCode), eq(deviceCodes.status, "authorized")))
    .returning();
  const row = rows[0];
  return row ? toLean(row) : null;
}

export async function updateStatus(
  db: BehalfPostgresDb,
  userCode: string,
  status: DeviceCodeStatus,
  options?: { userId?: string | null; sessionToken?: string | null; expectedStatus?: DeviceCodeStatus }
) {
  const set: Partial<typeof deviceCodes.$inferInsert> = { status };
  if (options && "userId" in options) set.userId = options.userId ?? null;
  if (options && "sessionToken" in options) set.sessionToken = options.sessionToken ?? null;

  const rows = await db
    .update(deviceCodes)
    .set(set)
    .where(
      options?.expectedStatus
        ? and(eq(deviceCodes.userCode, userCode), eq(deviceCodes.status, options.expectedStatus))
        : eq(deviceCodes.userCode, userCode)
    )
    .returning({ codeId: deviceCodes.codeId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function deleteExpired(db: BehalfPostgresDb, before = new Date()) {
  const rows = await db
    .delete(deviceCodes)
    .where(lte(deviceCodes.expiresAt, before))
    .returning({ codeId: deviceCodes.codeId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function findOneDeviceCode(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
): Promise<DeviceCodeLean | null> {
  const [row] = await db.select().from(deviceCodes).where(buildWhere(filter)).limit(1);
  return row ? toLean(row) : null;
}

export async function createDeviceCodeDocument(
  db: BehalfPostgresDb,
  input: Record<string, unknown>
): Promise<DeviceCodeLean> {
  try {
    const [row] = await db
      .insert(deviceCodes)
      .values(input as DeviceCodeInsert)
      .returning();
    if (!row) throw new Error("createDeviceCodeDocument failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function deleteDeviceCode(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
): Promise<DeviceCodeLean | null> {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({ codeId: deviceCodes.codeId })
      .from(deviceCodes)
      .where(buildWhere(filter))
      .limit(1);
    if (!match) return null;
    const [row] = await tx
      .delete(deviceCodes)
      .where(eq(deviceCodes.codeId, match.codeId))
      .returning();
    return row ? toLean(row) : null;
  });
}
