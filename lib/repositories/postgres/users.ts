import { and, eq, gt, inArray, lte, or } from "drizzle-orm";
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
