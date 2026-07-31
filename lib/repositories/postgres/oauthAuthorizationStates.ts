import { and, eq, gt, isNull, lte } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { oauthAuthorizationStates } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type { ExternalIdentityProvider } from "@/lib/repositories/postgres/externalIdentities";

export type OAuthFlowMode = "login" | "signup" | "link";

export type OAuthAuthorizationStateLean = {
  stateId: string;
  provider: ExternalIdentityProvider;
  mode: OAuthFlowMode;
  stateHash: string;
  codeVerifier: string;
  next: string | null;
  userId: string | null;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

export type CreateOAuthAuthorizationStateInput = {
  stateId: string;
  provider: ExternalIdentityProvider;
  mode: OAuthFlowMode;
  stateHash: string;
  codeVerifier: string;
  next?: string | null;
  userId?: string | null;
  expiresAt: Date;
};

type StateRow = typeof oauthAuthorizationStates.$inferSelect;

function toLean(row: StateRow): OAuthAuthorizationStateLean {
  return {
    stateId: row.stateId,
    provider: row.provider as ExternalIdentityProvider,
    mode: row.mode as OAuthFlowMode,
    stateHash: row.stateHash,
    codeVerifier: row.codeVerifier,
    next: row.next ?? null,
    userId: row.userId ?? null,
    consumedAt: row.consumedAt ?? null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt
  };
}

export async function createOAuthAuthorizationState(
  db: BehalfPostgresDb,
  input: CreateOAuthAuthorizationStateInput
): Promise<OAuthAuthorizationStateLean> {
  try {
    const [row] = await db
      .insert(oauthAuthorizationStates)
      .values({
        stateId: input.stateId,
        provider: input.provider,
        mode: input.mode,
        stateHash: input.stateHash,
        codeVerifier: input.codeVerifier,
        next: input.next ?? null,
        userId: input.userId ?? null,
        consumedAt: null,
        expiresAt: input.expiresAt
      })
      .returning();
    if (!row) throw new Error("createOAuthAuthorizationState failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

/**
 * Atomically consume a single-use OAuth state.
 * Only one concurrent caller can win when consumed_at IS NULL and unexpired.
 */
export async function consumeOAuthAuthorizationState(
  db: BehalfPostgresDb,
  options: {
    stateHash: string;
    provider: ExternalIdentityProvider;
    now?: Date;
  }
): Promise<OAuthAuthorizationStateLean | null> {
  const now = options.now ?? new Date();
  const [row] = await db
    .update(oauthAuthorizationStates)
    .set({ consumedAt: now })
    .where(
      and(
        eq(oauthAuthorizationStates.stateHash, options.stateHash),
        eq(oauthAuthorizationStates.provider, options.provider),
        isNull(oauthAuthorizationStates.consumedAt),
        gt(oauthAuthorizationStates.expiresAt, now)
      )
    )
    .returning();
  return row ? toLean(row) : null;
}

export async function deleteExpiredOAuthAuthorizationStates(
  db: BehalfPostgresDb,
  before = new Date()
) {
  const rows = await db
    .delete(oauthAuthorizationStates)
    .where(lte(oauthAuthorizationStates.expiresAt, before))
    .returning({ stateId: oauthAuthorizationStates.stateId });
  return { acknowledged: true, deletedCount: rows.length };
}
