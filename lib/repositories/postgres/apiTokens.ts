import { and, eq, or } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { developerApiTokens } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreateApiTokenInput,
  DeveloperApiTokenLean
} from "@/lib/repositories/apiTokens";

type TokenRow = typeof developerApiTokens.$inferSelect;

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
