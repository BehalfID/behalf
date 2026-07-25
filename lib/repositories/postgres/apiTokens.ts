import {
  and,
  count,
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
import { developerApiTokens } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreateApiTokenInput,
  DeveloperApiTokenLean
} from "@/lib/repositories/apiTokens";

type TokenRow = typeof developerApiTokens.$inferSelect;
type TokenInsert = typeof developerApiTokens.$inferInsert;

const columns: Record<string, AnyPgColumn> = {
  tokenId: developerApiTokens.tokenId,
  userId: developerApiTokens.userId,
  accountId: developerApiTokens.accountId,
  name: developerApiTokens.name,
  tokenPreview: developerApiTokens.tokenPreview,
  tokenHash: developerApiTokens.tokenHash,
  lastUsedAt: developerApiTokens.lastUsedAt,
  createdAt: developerApiTokens.createdAt,
  updatedAt: developerApiTokens.updatedAt
};

function columnFor(key: string) {
  const column = columns[key];
  if (!column) throw new Error(`Unsupported api token filter field: ${key}`);
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
            throw new Error(`Unsupported api token filter operator: ${operator}`);
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

function toLean(row: TokenRow): DeveloperApiTokenLean {
  return {
    tokenId: row.tokenId,
    userId: row.userId,
    accountId: row.accountId,
    name: row.name,
    tokenPreview: row.tokenPreview ?? undefined,
    tokenHash: row.tokenHash,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function findByTokenHash(
  db: BehalfPostgresDb,
  tokenHash: string
): Promise<DeveloperApiTokenLean | null> {
  const row =
    (await db.query.developerApiTokens.findFirst({
      where: eq(developerApiTokens.tokenHash, tokenHash)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function createApiToken(
  db: BehalfPostgresDb,
  input: CreateApiTokenInput
): Promise<DeveloperApiTokenLean> {
  try {
    const [row] = await db
      .insert(developerApiTokens)
      .values({
        tokenId: input.tokenId,
        userId: input.userId,
        accountId: input.accountId,
        name: input.name,
        tokenPreview: input.tokenPreview,
        tokenHash: input.tokenHash!
      })
      .returning();
    if (!row) throw new Error("createApiToken failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function listByUserId(
  db: BehalfPostgresDb,
  userId: string,
  options?: { accountId?: string; select?: string }
): Promise<DeveloperApiTokenLean[]> {
  const rows = await db.query.developerApiTokens.findMany({
    where: options?.accountId
      ? and(eq(developerApiTokens.userId, userId), eq(developerApiTokens.accountId, options.accountId))
      : eq(developerApiTokens.userId, userId)
  });
  return rows.map(toLean);
}

export async function countByUserId(db: BehalfPostgresDb, userId: string, accountId?: string) {
  const rows = await db
    .select({ tokenId: developerApiTokens.tokenId })
    .from(developerApiTokens)
    .where(
      accountId
        ? and(eq(developerApiTokens.userId, userId), eq(developerApiTokens.accountId, accountId))
        : eq(developerApiTokens.userId, userId)
    );
  return rows.length;
}

export async function deleteByTokenId(db: BehalfPostgresDb, tokenId: string, userId?: string) {
  const rows = await db
    .delete(developerApiTokens)
    .where(
      userId
        ? and(eq(developerApiTokens.tokenId, tokenId), eq(developerApiTokens.userId, userId))
        : eq(developerApiTokens.tokenId, tokenId)
    )
    .returning({ tokenId: developerApiTokens.tokenId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function deleteManyByUserId(db: BehalfPostgresDb, userId: string) {
  const rows = await db
    .delete(developerApiTokens)
    .where(eq(developerApiTokens.userId, userId))
    .returning({ tokenId: developerApiTokens.tokenId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function deleteManyByUserOrAccount(
  db: BehalfPostgresDb,
  userId: string,
  accountId: string
) {
  const rows = await db
    .delete(developerApiTokens)
    .where(or(eq(developerApiTokens.userId, userId), eq(developerApiTokens.accountId, accountId)))
    .returning({ tokenId: developerApiTokens.tokenId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function touchLastUsed(db: BehalfPostgresDb, tokenId: string, at = new Date()) {
  const rows = await db
    .update(developerApiTokens)
    .set({ lastUsedAt: at, updatedAt: new Date() })
    .where(eq(developerApiTokens.tokenId, tokenId))
    .returning({ tokenId: developerApiTokens.tokenId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function findApiTokens(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
): Promise<DeveloperApiTokenLean[]> {
  const rows = await db.select().from(developerApiTokens).where(buildWhere(filter));
  return rows.map(toLean);
}

export async function createApiTokenDocument(
  db: BehalfPostgresDb,
  input: Record<string, unknown>
): Promise<DeveloperApiTokenLean> {
  try {
    const [row] = await db
      .insert(developerApiTokens)
      .values(input as TokenInsert)
      .returning();
    if (!row) throw new Error("createApiTokenDocument failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function countApiTokens(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
) {
  const [row] = await db
    .select({ value: count() })
    .from(developerApiTokens)
    .where(buildWhere(filter));
  return row?.value ?? 0;
}

export async function deleteApiToken(db: BehalfPostgresDb, filter: Record<string, unknown>) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({ tokenId: developerApiTokens.tokenId })
      .from(developerApiTokens)
      .where(buildWhere(filter))
      .limit(1);
    if (!match) return { acknowledged: true, deletedCount: 0 };
    const rows = await tx
      .delete(developerApiTokens)
      .where(eq(developerApiTokens.tokenId, match.tokenId))
      .returning({ tokenId: developerApiTokens.tokenId });
    return { acknowledged: true, deletedCount: rows.length };
  });
}
