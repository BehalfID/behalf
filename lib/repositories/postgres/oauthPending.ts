import { eq, lte } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { oauthPendingSignups } from "@/lib/db/postgres/schema";
import { normalizeEmail } from "@/lib/developerAuth";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreateOAuthPendingSignupInput,
  OAuthPendingSignupLean
} from "@/lib/repositories/oauthPending";

type PendingRow = typeof oauthPendingSignups.$inferSelect;

function toLean(row: PendingRow): OAuthPendingSignupLean {
  return {
    pendingId: row.pendingId,
    googleSub: row.googleSub,
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
        googleSub: input.googleSub,
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
