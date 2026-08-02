import { and, eq, gt, isNull } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { reauthProofs } from "@/lib/db/postgres/schema";
import type { REAUTH_METHODS, REAUTH_PURPOSES } from "@/lib/db/postgres/enums";
import { translatePostgresError } from "@/lib/repositories/errors";

export type ReauthPurpose = (typeof REAUTH_PURPOSES)[number];
export type ReauthMethod = (typeof REAUTH_METHODS)[number];

export type ReauthProofLean = {
  proofId: string;
  userId: string;
  purpose: ReauthPurpose;
  method: ReauthMethod;
  proofHash: string;
  sessionId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

type ProofRow = typeof reauthProofs.$inferSelect;

function toLean(row: ProofRow): ReauthProofLean {
  return {
    proofId: row.proofId,
    userId: row.userId,
    purpose: row.purpose as ReauthPurpose,
    method: row.method as ReauthMethod,
    proofHash: row.proofHash,
    sessionId: row.sessionId ?? null,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt ?? null,
    createdAt: row.createdAt
  };
}

export async function createReauthProof(
  db: BehalfPostgresDb,
  input: {
    proofId: string;
    userId: string;
    purpose: ReauthPurpose;
    method: ReauthMethod;
    proofHash: string;
    sessionId?: string | null;
    expiresAt: Date;
  }
): Promise<ReauthProofLean> {
  try {
    const [row] = await db
      .insert(reauthProofs)
      .values({
        proofId: input.proofId,
        userId: input.userId,
        purpose: input.purpose,
        method: input.method,
        proofHash: input.proofHash,
        sessionId: input.sessionId ?? null,
        expiresAt: input.expiresAt,
        consumedAt: null
      })
      .returning();
    if (!row) throw new Error("createReauthProof failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

/** Atomically consume an unexpired, unused proof for the expected user+purpose. */
export async function consumeReauthProof(
  db: BehalfPostgresDb,
  options: {
    proofHash: string;
    userId: string;
    purpose: ReauthPurpose;
    now?: Date;
  }
): Promise<ReauthProofLean | null> {
  const now = options.now ?? new Date();
  const returned = await db
    .update(reauthProofs)
    .set({ consumedAt: now })
    .where(
      and(
        eq(reauthProofs.proofHash, options.proofHash),
        eq(reauthProofs.userId, options.userId),
        eq(reauthProofs.purpose, options.purpose),
        isNull(reauthProofs.consumedAt),
        gt(reauthProofs.expiresAt, now)
      )
    )
    .returning();
  const row = Array.isArray(returned) ? returned[0] : undefined;
  return row ? toLean(row) : null;
}

export async function findReauthProofByHash(
  db: BehalfPostgresDb,
  proofHash: string
): Promise<ReauthProofLean | null> {
  const [row] = await db
    .select()
    .from(reauthProofs)
    .where(eq(reauthProofs.proofHash, proofHash))
    .limit(1);
  return row ? toLean(row) : null;
}
