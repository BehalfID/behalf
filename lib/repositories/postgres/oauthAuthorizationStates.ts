import { and, eq, gt, isNull, lte } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { oauthAuthorizationStates } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type { ExternalIdentityProvider } from "@/lib/repositories/postgres/externalIdentities";

export type OAuthFlowMode = "login" | "signup" | "link" | "reauth";

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

/** Lookup by hash for failure classification after a failed atomic consume. */
export async function findOAuthAuthorizationStateByHash(
  db: BehalfPostgresDb,
  options: { stateHash: string }
): Promise<OAuthAuthorizationStateLean | null> {
  const [row] = await db
    .select()
    .from(oauthAuthorizationStates)
    .where(eq(oauthAuthorizationStates.stateHash, options.stateHash))
    .limit(1);
  return row ? toLean(row) : null;
}

/**
 * Atomically consume a single-use OAuth state.
 * Only one concurrent caller can win when consumed_at IS NULL and unexpired.
 *
 * Drizzle + postgres.js returns the RETURNING row array; destructure `[row]` —
 * do not treat the driver result as Mongo-style `{ value }`.
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
  const returned = await db
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
  const row = Array.isArray(returned) ? returned[0] : undefined;
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
