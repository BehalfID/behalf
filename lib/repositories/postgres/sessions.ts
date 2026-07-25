import { and, eq, gt, gte, inArray, isNull, lt, lte, ne, notInArray, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { developerSessions } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreateSessionInput,
  DeveloperSessionLean
} from "@/lib/repositories/sessions";

type SessionRow = typeof developerSessions.$inferSelect;

const columns: Record<string, AnyPgColumn> = {
  sessionId: developerSessions.sessionId,
  userId: developerSessions.userId,
  tokenHash: developerSessions.tokenHash,
  expiresAt: developerSessions.expiresAt,
  lastActivityAt: developerSessions.lastActivityAt,
  activeAccountId: developerSessions.activeAccountId,
  createdAt: developerSessions.createdAt
};

function columnFor(key: string) {
  const column = columns[key];
  if (!column) throw new Error(`Unsupported session filter field: ${key}`);
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
            throw new Error(`Unsupported session filter operator: ${operator}`);
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

function toLean(row: SessionRow): DeveloperSessionLean {
  return {
    sessionId: row.sessionId,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    lastActivityAt: row.lastActivityAt,
    activeAccountId: row.activeAccountId,
    createdAt: row.createdAt
  };
}

export async function createSession(
  db: BehalfPostgresDb,
  input: CreateSessionInput
): Promise<DeveloperSessionLean> {
  try {
    const [row] = await db
      .insert(developerSessions)
      .values({
        sessionId: input.sessionId,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        lastActivityAt: input.lastActivityAt ?? new Date(),
        activeAccountId: input.activeAccountId ?? null
      })
      .returning();
    if (!row) throw new Error("createSession failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findByTokenHash(
  db: BehalfPostgresDb,
  tokenHash: string,
  options?: { requireUnexpired?: boolean; select?: string }
): Promise<DeveloperSessionLean | null> {
  const row =
    (await db.query.developerSessions.findFirst({
      where: options?.requireUnexpired
        ? and(eq(developerSessions.tokenHash, tokenHash), gt(developerSessions.expiresAt, new Date()))
        : eq(developerSessions.tokenHash, tokenHash)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findBySessionId(
  db: BehalfPostgresDb,
  sessionId: string,
  options?: { userId?: string; select?: string }
): Promise<DeveloperSessionLean | null> {
  const row =
    (await db.query.developerSessions.findFirst({
      where: options?.userId
        ? and(eq(developerSessions.sessionId, sessionId), eq(developerSessions.userId, options.userId))
        : eq(developerSessions.sessionId, sessionId)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function updateActivity(
  db: BehalfPostgresDb,
  sessionId: string,
  lastActivityAt: Date,
  expiresAt: Date
) {
  const rows = await db
    .update(developerSessions)
    .set({ lastActivityAt, expiresAt })
    .where(eq(developerSessions.sessionId, sessionId))
    .returning({ sessionId: developerSessions.sessionId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function deleteBySessionId(
  db: BehalfPostgresDb,
  sessionId: string,
  options?: { userId?: string }
) {
  const rows = await db
    .delete(developerSessions)
    .where(
      options?.userId
        ? and(eq(developerSessions.sessionId, sessionId), eq(developerSessions.userId, options.userId))
        : eq(developerSessions.sessionId, sessionId)
    )
    .returning({ sessionId: developerSessions.sessionId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function deleteByTokenHash(db: BehalfPostgresDb, tokenHash: string) {
  const rows = await db
    .delete(developerSessions)
    .where(eq(developerSessions.tokenHash, tokenHash))
    .returning({ sessionId: developerSessions.sessionId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function deleteByUserId(db: BehalfPostgresDb, userId: string) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({ sessionId: developerSessions.sessionId })
      .from(developerSessions)
      .where(eq(developerSessions.userId, userId))
      .limit(1);
    if (!match) return { acknowledged: true, deletedCount: 0 };
    const rows = await tx
      .delete(developerSessions)
      .where(eq(developerSessions.sessionId, match.sessionId))
      .returning({ sessionId: developerSessions.sessionId });
    return { acknowledged: true, deletedCount: rows.length };
  });
}

export async function deleteManyByUserId(db: BehalfPostgresDb, userId: string) {
  const rows = await db
    .delete(developerSessions)
    .where(eq(developerSessions.userId, userId))
    .returning({ sessionId: developerSessions.sessionId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function updateActiveAccountId(
  db: BehalfPostgresDb,
  userId: string,
  sessionId: string,
  activeAccountId: string | null
) {
  const rows = await db
    .update(developerSessions)
    .set({ activeAccountId })
    .where(and(eq(developerSessions.sessionId, sessionId), eq(developerSessions.userId, userId)))
    .returning({ sessionId: developerSessions.sessionId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function clearActiveAccountIdForUserAccount(
  db: BehalfPostgresDb,
  userId: string,
  accountId: string
) {
  const rows = await db
    .update(developerSessions)
    .set({ activeAccountId: null })
    .where(
      and(eq(developerSessions.userId, userId), eq(developerSessions.activeAccountId, accountId))
    )
    .returning({ sessionId: developerSessions.sessionId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function deleteSession(db: BehalfPostgresDb, filter: Record<string, unknown>) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({ sessionId: developerSessions.sessionId })
      .from(developerSessions)
      .where(buildWhere(filter))
      .limit(1);
    if (!match) return { acknowledged: true, deletedCount: 0 };
    const rows = await tx
      .delete(developerSessions)
      .where(eq(developerSessions.sessionId, match.sessionId))
      .returning({ sessionId: developerSessions.sessionId });
    return { acknowledged: true, deletedCount: rows.length };
  });
}

export async function deleteSessions(db: BehalfPostgresDb, filter: Record<string, unknown>) {
  const rows = await db
    .delete(developerSessions)
    .where(buildWhere(filter))
    .returning({ sessionId: developerSessions.sessionId });
  return { acknowledged: true, deletedCount: rows.length };
}
