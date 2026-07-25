import { and, eq, gt } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { developerSessions } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreateSessionInput,
  DeveloperSessionLean
} from "@/lib/repositories/sessions";

type SessionRow = typeof developerSessions.$inferSelect;

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
