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
import { developerUsers } from "@/lib/db/postgres/schema";
import { normalizeEmail } from "@/lib/developerAuth";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreateUserInput,
  DeveloperUserLean,
  UserSet
} from "@/lib/repositories/users";

type UserRow = typeof developerUsers.$inferSelect;
type UserInsert = typeof developerUsers.$inferInsert;

const columns: Record<string, AnyPgColumn> = {
  userId: developerUsers.userId,
  email: developerUsers.email,
  passwordHash: developerUsers.passwordHash,
  googleSub: developerUsers.googleSub,
  authProviders: developerUsers.authProviders,
  onboardingUseCase: developerUsers.onboardingUseCase,
  primaryAccountId: developerUsers.primaryAccountId,
  firstName: developerUsers.firstName,
  lastName: developerUsers.lastName,
  jobTitle: developerUsers.jobTitle,
  phone: developerUsers.phone,
  onboardingCompletedAt: developerUsers.onboardingCompletedAt,
  dateOfBirth: developerUsers.dateOfBirth,
  emailVerified: developerUsers.emailVerified,
  emailVerificationTokenHash: developerUsers.emailVerificationTokenHash,
  emailVerificationTokenExpiresAt: developerUsers.emailVerificationTokenExpiresAt,
  emailVerificationCodeHash: developerUsers.emailVerificationCodeHash,
  passwordResetTokenHash: developerUsers.passwordResetTokenHash,
  passwordResetTokenExpiresAt: developerUsers.passwordResetTokenExpiresAt,
  createdAt: developerUsers.createdAt,
  updatedAt: developerUsers.updatedAt
};

function columnFor(key: string) {
  const column = columns[key];
  if (!column) throw new Error(`Unsupported user filter field: ${key}`);
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
            throw new Error(`Unsupported user filter operator: ${operator}`);
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

function updateByFilterValues(update: Record<string, unknown>): Record<string, unknown> {
  const set: Record<string, unknown> = {
    ...normalizeSet((update.$set as UserSet | undefined) ?? {}),
    updatedAt: new Date()
  };

  if (update.$unset && typeof update.$unset === "object") {
    for (const key of Object.keys(update.$unset as Record<string, unknown>)) {
      if (!columns[key]) throw new Error(`Unsupported user update field: ${key}`);
      set[key] = null;
    }
  }

  void update.$inc;
  return set;
}

function toLean(row: UserRow): DeveloperUserLean {
  return {
    userId: row.userId,
    email: row.email,
    passwordHash: row.passwordHash ?? undefined,
    googleSub: row.googleSub ?? undefined,
    authProviders: row.authProviders ?? undefined,
    onboardingUseCase: row.onboardingUseCase as DeveloperUserLean["onboardingUseCase"],
    primaryAccountId: row.primaryAccountId,
    firstName: row.firstName,
    lastName: row.lastName,
    jobTitle: row.jobTitle,
    phone: row.phone,
    onboardingCompletedAt: row.onboardingCompletedAt,
    dateOfBirth: row.dateOfBirth ?? undefined,
    emailVerified: row.emailVerified,
    emailVerificationTokenHash: row.emailVerificationTokenHash ?? undefined,
    emailVerificationTokenExpiresAt: row.emailVerificationTokenExpiresAt ?? undefined,
    emailVerificationCodeHash: row.emailVerificationCodeHash ?? undefined,
    passwordResetTokenHash: row.passwordResetTokenHash ?? undefined,
    passwordResetTokenExpiresAt: row.passwordResetTokenExpiresAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function normalizeSet(set: UserSet): Partial<UserInsert> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(set)) {
    if (key === "email" && typeof value === "string") {
      result.email = normalizeEmail(value);
      continue;
    }
    result[key] = value;
  }
  return result as Partial<UserInsert>;
}

export async function findByEmail(
  db: BehalfPostgresDb,
  email: string,
  _options?: { select?: string }
): Promise<DeveloperUserLean | null> {
  const row =
    (await db.query.developerUsers.findFirst({
      where: eq(developerUsers.email, normalizeEmail(email))
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findByEmailWithPassword(
  db: BehalfPostgresDb,
  email: string
): Promise<DeveloperUserLean | null> {
  return findByEmail(db, email);
}

export async function findByUserId(
  db: BehalfPostgresDb,
  userId: string,
  _options?: { select?: string }
): Promise<DeveloperUserLean | null> {
  const row =
    (await db.query.developerUsers.findFirst({
      where: eq(developerUsers.userId, userId)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findByGoogleSub(
  db: BehalfPostgresDb,
  googleSub: string,
  _options?: { select?: string }
): Promise<DeveloperUserLean | null> {
  const row =
    (await db.query.developerUsers.findFirst({
      where: eq(developerUsers.googleSub, googleSub)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findByPasswordResetTokenHash(
  db: BehalfPostgresDb,
  tokenHash: string
): Promise<DeveloperUserLean | null> {
  const row =
    (await db.query.developerUsers.findFirst({
      where: and(
        eq(developerUsers.passwordResetTokenHash, tokenHash),
        gt(developerUsers.passwordResetTokenExpiresAt, new Date())
      )
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findByVerificationTokenHash(
  db: BehalfPostgresDb,
  tokenHash: string
): Promise<DeveloperUserLean | null> {
  const row =
    (await db.query.developerUsers.findFirst({
      where: and(
        eq(developerUsers.emailVerificationTokenHash, tokenHash),
        gt(developerUsers.emailVerificationTokenExpiresAt, new Date())
      )
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findByVerificationCodeHash(
  db: BehalfPostgresDb,
  codeHash: string
): Promise<DeveloperUserLean | null> {
  const row =
    (await db.query.developerUsers.findFirst({
      where: and(
        eq(developerUsers.emailVerificationCodeHash, codeHash),
        gt(developerUsers.emailVerificationTokenExpiresAt, new Date())
      )
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findByUserIds(
  db: BehalfPostgresDb,
  userIds: string[],
  _select = "userId email"
): Promise<DeveloperUserLean[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select()
    .from(developerUsers)
    .where(inArray(developerUsers.userId, userIds));
  return rows.map(toLean);
}

export async function existsByEmail(db: BehalfPostgresDb, email: string): Promise<boolean> {
  const row = await db.query.developerUsers.findFirst({
    where: eq(developerUsers.email, normalizeEmail(email)),
    columns: { userId: true }
  });
  return Boolean(row);
}

export async function existsByEmailOrGoogleSub(
  db: BehalfPostgresDb,
  email: string,
  googleSub: string
): Promise<boolean> {
  const row = await db.query.developerUsers.findFirst({
    where: or(
      eq(developerUsers.email, normalizeEmail(email)),
      eq(developerUsers.googleSub, googleSub)
    ),
    columns: { userId: true }
  });
  return Boolean(row);
}

export async function createUser(
  db: BehalfPostgresDb,
  input: CreateUserInput
): Promise<DeveloperUserLean> {
  try {
    const [row] = await db
      .insert(developerUsers)
      .values({
        ...input,
        email: normalizeEmail(input.email),
        onboardingUseCase: input.onboardingUseCase ?? "sdk"
      } as UserInsert)
      .returning();
    if (!row) throw new Error("createUser failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function updateUser(db: BehalfPostgresDb, userId: string, set: UserSet) {
  try {
    const rows = await db
      .update(developerUsers)
      .set({ ...normalizeSet(set), updatedAt: new Date() })
      .where(eq(developerUsers.userId, userId))
      .returning({ userId: developerUsers.userId });
    return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function updateUserAtomic(
  db: BehalfPostgresDb,
  userId: string,
  update: { $set?: UserSet; $unset?: Record<string, unknown>; $inc?: Record<string, number> }
) {
  const set: Record<string, unknown> = {
    ...normalizeSet(update.$set ?? {}),
    updatedAt: new Date()
  };

  if (update.$unset) {
    for (const key of Object.keys(update.$unset)) {
      set[key] = null;
    }
  }

  // `$inc` is accepted for Mongo parity but users have no numeric counters in Postgres.
  void update.$inc;

  try {
    const rows = await db
      .update(developerUsers)
      .set(set)
      .where(eq(developerUsers.userId, userId))
      .returning({ userId: developerUsers.userId });
    return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findUnverifiedExpired(
  db: BehalfPostgresDb,
  cutoff: Date
): Promise<Array<Pick<DeveloperUserLean, "userId">>> {
  const rows = await db
    .select({ userId: developerUsers.userId })
    .from(developerUsers)
    .where(and(eq(developerUsers.emailVerified, false), lte(developerUsers.createdAt, cutoff)));
  return rows;
}

export async function deleteUser(db: BehalfPostgresDb, userId: string) {
  const rows = await db
    .delete(developerUsers)
    .where(eq(developerUsers.userId, userId))
    .returning({ userId: developerUsers.userId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function createUserDocument(
  db: BehalfPostgresDb,
  input: Record<string, unknown>
): Promise<DeveloperUserLean> {
  const values = { ...input };
  if (typeof values.email === "string") {
    values.email = normalizeEmail(values.email);
  }
  try {
    const [row] = await db
      .insert(developerUsers)
      .values(values as UserInsert)
      .returning();
    if (!row) throw new Error("createUserDocument failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findUsers(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
): Promise<DeveloperUserLean[]> {
  const rows = await db.select().from(developerUsers).where(buildWhere(filter));
  return rows.map(toLean);
}

export async function findOneUser(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
): Promise<DeveloperUserLean | null> {
  const [row] = await db.select().from(developerUsers).where(buildWhere(filter)).limit(1);
  return row ? toLean(row) : null;
}

export async function updateUserByFilter(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({ userId: developerUsers.userId })
      .from(developerUsers)
      .where(buildWhere(filter))
      .limit(1);
    if (!match) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    try {
      const rows = await tx
        .update(developerUsers)
        .set(updateByFilterValues(update))
        .where(eq(developerUsers.userId, match.userId))
        .returning({ userId: developerUsers.userId });
      return { acknowledged: true, matchedCount: 1, modifiedCount: rows.length };
    } catch (error) {
      translatePostgresError(error);
    }
  });
}

export async function countUserDocuments(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
) {
  const [row] = await db
    .select({ value: count() })
    .from(developerUsers)
    .where(buildWhere(filter));
  return row?.value ?? 0;
}

export async function userExists(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
): Promise<Pick<DeveloperUserLean, "userId"> | null> {
  const row =
    (await db.query.developerUsers.findFirst({
      where: buildWhere(filter),
      columns: { userId: true }
    })) ?? null;
  return row ?? null;
}
