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
import { oauthPendingSignups } from "@/lib/db/postgres/schema";
import { normalizeEmail } from "@/lib/developerAuth";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreateOAuthPendingSignupInput,
  OAuthPendingSignupLean
} from "@/lib/repositories/oauthPending";

type PendingRow = typeof oauthPendingSignups.$inferSelect;
type PendingInsert = typeof oauthPendingSignups.$inferInsert;

const columns: Record<string, AnyPgColumn> = {
  pendingId: oauthPendingSignups.pendingId,
  googleSub: oauthPendingSignups.googleSub,
  provider: oauthPendingSignups.provider,
  providerAccountId: oauthPendingSignups.providerAccountId,
  email: oauthPendingSignups.email,
  emailVerified: oauthPendingSignups.emailVerified,
  firstName: oauthPendingSignups.firstName,
  lastName: oauthPendingSignups.lastName,
  tokenHash: oauthPendingSignups.tokenHash,
  expiresAt: oauthPendingSignups.expiresAt,
  createdAt: oauthPendingSignups.createdAt
};

function columnFor(key: string) {
  const column = columns[key];
  if (!column) throw new Error(`Unsupported oauth pending filter field: ${key}`);
  return column;
}

function normalizeFilterValue(key: string, value: unknown): unknown {
  if (key === "email" && typeof value === "string") return normalizeEmail(value);
  return value;
}

function fieldCondition(key: string, value: unknown): SQL {
  const column = columnFor(key);
  if (value === null) return isNull(column);

  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    const conditions = Object.entries(value as Record<string, unknown>).map(
      ([operator, operand]) => {
        switch (operator) {
          case "$in":
            return inArray(
              column,
              (operand as unknown[]).map((item) => normalizeFilterValue(key, item))
            );
          case "$nin":
            return notInArray(
              column,
              (operand as unknown[]).map((item) => normalizeFilterValue(key, item))
            );
          case "$ne":
            return operand === null
              ? or(ne(column, operand), isNull(column))!
              : ne(column, normalizeFilterValue(key, operand));
          case "$gt":
            return gt(column, operand);
          case "$gte":
            return gte(column, operand);
          case "$lt":
            return lt(column, operand);
          case "$lte":
            return lte(column, operand);
          default:
            throw new Error(`Unsupported oauth pending filter operator: ${operator}`);
        }
      }
    );
    return and(...conditions)!;
  }

  return eq(column, normalizeFilterValue(key, value));
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

function toLean(row: PendingRow): OAuthPendingSignupLean {
  return {
    pendingId: row.pendingId,
    googleSub: row.googleSub,
    provider: row.provider as OAuthPendingSignupLean["provider"],
    providerAccountId: row.providerAccountId,
    email: row.email,
    emailVerified: row.emailVerified,
    firstName: row.firstName,
    lastName: row.lastName,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt
  };
}

export async function createPendingSignup(
  db: BehalfPostgresDb,
  input: CreateOAuthPendingSignupInput
): Promise<OAuthPendingSignupLean> {
  try {
    const [row] = await db
      .insert(oauthPendingSignups)
      .values({
        pendingId: input.pendingId,
        googleSub: input.googleSub ?? null,
        provider: input.provider ?? (input.googleSub ? "google" : "github"),
        providerAccountId: input.providerAccountId ?? input.googleSub ?? null,
        email: normalizeEmail(input.email),
        emailVerified: input.emailVerified,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        tokenHash: input.tokenHash!,
        expiresAt: input.expiresAt
      })
      .returning();
    if (!row) throw new Error("createPendingSignup failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findByPendingId(
  db: BehalfPostgresDb,
  pendingId: string,
  _options?: { includeTokenHash?: boolean }
): Promise<OAuthPendingSignupLean | null> {
  const row =
    (await db.query.oauthPendingSignups.findFirst({
      where: eq(oauthPendingSignups.pendingId, pendingId)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findByTokenHash(
  db: BehalfPostgresDb,
  tokenHash: string
): Promise<OAuthPendingSignupLean | null> {
  const row =
    (await db.query.oauthPendingSignups.findFirst({
      where: eq(oauthPendingSignups.tokenHash, tokenHash)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findByGoogleSub(
  db: BehalfPostgresDb,
  googleSub: string
): Promise<OAuthPendingSignupLean | null> {
  const row =
    (await db.query.oauthPendingSignups.findFirst({
      where: eq(oauthPendingSignups.googleSub, googleSub)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function deleteByPendingId(db: BehalfPostgresDb, pendingId: string) {
  const rows = await db
    .delete(oauthPendingSignups)
    .where(eq(oauthPendingSignups.pendingId, pendingId))
    .returning({ pendingId: oauthPendingSignups.pendingId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function deleteExpired(db: BehalfPostgresDb, before = new Date()) {
  const rows = await db
    .delete(oauthPendingSignups)
    .where(lte(oauthPendingSignups.expiresAt, before))
    .returning({ pendingId: oauthPendingSignups.pendingId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function findOnePendingSignup(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
): Promise<OAuthPendingSignupLean | null> {
  const [row] = await db.select().from(oauthPendingSignups).where(buildWhere(filter)).limit(1);
  return row ? toLean(row) : null;
}

export async function createPendingSignupDocument(
  db: BehalfPostgresDb,
  input: Record<string, unknown>
): Promise<OAuthPendingSignupLean> {
  const values = { ...input };
  if (typeof values.email === "string") {
    values.email = normalizeEmail(values.email);
  }
  try {
    const [row] = await db
      .insert(oauthPendingSignups)
      .values(values as PendingInsert)
      .returning();
    if (!row) throw new Error("createPendingSignupDocument failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function deletePendingSignup(db: BehalfPostgresDb, filter: Record<string, unknown>) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({ pendingId: oauthPendingSignups.pendingId })
      .from(oauthPendingSignups)
      .where(buildWhere(filter))
      .limit(1);
    if (!match) return { acknowledged: true, deletedCount: 0 };
    const rows = await tx
      .delete(oauthPendingSignups)
      .where(eq(oauthPendingSignups.pendingId, match.pendingId))
      .returning({ pendingId: oauthPendingSignups.pendingId });
    return { acknowledged: true, deletedCount: rows.length };
  });
}
