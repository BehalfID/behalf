import { and, count, desc, eq, gt, isNull, lte } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { passkeyCredentials, webauthnChallenges } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";

export type PasskeyCredentialLean = {
  credentialRecordId: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  transports: string[] | null;
  nickname: string;
  userHandle: string;
  deviceType: string | null;
  backedUp: boolean;
  aaguid: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePasskeyCredentialInput = {
  credentialRecordId: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  signCount?: number;
  transports?: string[] | null;
  nickname: string;
  userHandle: string;
  deviceType?: string | null;
  backedUp?: boolean;
  aaguid?: string | null;
};

export type WebAuthnChallengeKind = "registration" | "authentication";

export type WebAuthnChallengeLean = {
  challengeId: string;
  challengeHash: string;
  kind: WebAuthnChallengeKind;
  userId: string | null;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

export type CreateWebAuthnChallengeInput = {
  challengeId: string;
  challengeHash: string;
  kind: WebAuthnChallengeKind;
  userId?: string | null;
  expiresAt: Date;
};

type CredentialRow = typeof passkeyCredentials.$inferSelect;
type ChallengeRow = typeof webauthnChallenges.$inferSelect;

function toCredentialLean(row: CredentialRow): PasskeyCredentialLean {
  return {
    credentialRecordId: row.credentialRecordId,
    userId: row.userId,
    credentialId: row.credentialId,
    publicKey: row.publicKey,
    signCount: row.signCount,
    transports: row.transports ?? null,
    nickname: row.nickname,
    userHandle: row.userHandle,
    deviceType: row.deviceType ?? null,
    backedUp: row.backedUp,
    aaguid: row.aaguid ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toChallengeLean(row: ChallengeRow): WebAuthnChallengeLean {
  return {
    challengeId: row.challengeId,
    challengeHash: row.challengeHash,
    kind: row.kind as WebAuthnChallengeKind,
    userId: row.userId ?? null,
    consumedAt: row.consumedAt ?? null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt
  };
}

export async function listPasskeysByUserId(
  db: BehalfPostgresDb,
  userId: string
): Promise<PasskeyCredentialLean[]> {
  const rows = await db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, userId))
    .orderBy(desc(passkeyCredentials.createdAt));
  return rows.map(toCredentialLean);
}

export async function findPasskeyByCredentialId(
  db: BehalfPostgresDb,
  credentialId: string
): Promise<PasskeyCredentialLean | null> {
  const row =
    (await db.query.passkeyCredentials.findFirst({
      where: eq(passkeyCredentials.credentialId, credentialId)
    })) ?? null;
  return row ? toCredentialLean(row) : null;
}

export async function findPasskeyByRecordId(
  db: BehalfPostgresDb,
  userId: string,
  credentialRecordId: string
): Promise<PasskeyCredentialLean | null> {
  const row =
    (await db.query.passkeyCredentials.findFirst({
      where: and(
        eq(passkeyCredentials.userId, userId),
        eq(passkeyCredentials.credentialRecordId, credentialRecordId)
      )
    })) ?? null;
  return row ? toCredentialLean(row) : null;
}

export async function countPasskeysByUserId(db: BehalfPostgresDb, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, userId));
  return row?.value ?? 0;
}

export async function passkeyExists(
  db: BehalfPostgresDb,
  userId: string,
  credentialRecordId: string
): Promise<boolean> {
  const row = await db.query.passkeyCredentials.findFirst({
    where: and(
      eq(passkeyCredentials.userId, userId),
      eq(passkeyCredentials.credentialRecordId, credentialRecordId)
    ),
    columns: { credentialRecordId: true }
  });
  return Boolean(row);
}

export async function createPasskeyCredential(
  db: BehalfPostgresDb,
  input: CreatePasskeyCredentialInput
): Promise<PasskeyCredentialLean> {
  try {
    const [row] = await db
      .insert(passkeyCredentials)
      .values({
        credentialRecordId: input.credentialRecordId,
        userId: input.userId,
        credentialId: input.credentialId,
        publicKey: input.publicKey,
        signCount: input.signCount ?? 0,
        transports: input.transports ?? null,
        nickname: input.nickname,
        userHandle: input.userHandle,
        deviceType: input.deviceType ?? null,
        backedUp: input.backedUp ?? false,
        aaguid: input.aaguid ?? null
      })
      .returning();
    if (!row) throw new Error("createPasskeyCredential failed to return a row");
    return toCredentialLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function updatePasskeyCredential(
  db: BehalfPostgresDb,
  userId: string,
  credentialRecordId: string,
  set: Partial<{
    nickname: string;
    signCount: number;
    lastUsedAt: Date;
  }>
): Promise<PasskeyCredentialLean | null> {
  const [row] = await db
    .update(passkeyCredentials)
    .set({ ...set, updatedAt: new Date() })
    .where(
      and(
        eq(passkeyCredentials.userId, userId),
        eq(passkeyCredentials.credentialRecordId, credentialRecordId)
      )
    )
    .returning();
  return row ? toCredentialLean(row) : null;
}

export async function updatePasskeyByRecordId(
  db: BehalfPostgresDb,
  credentialRecordId: string,
  set: Partial<{
    nickname: string;
    signCount: number;
    lastUsedAt: Date;
  }>
): Promise<PasskeyCredentialLean | null> {
  const [row] = await db
    .update(passkeyCredentials)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(passkeyCredentials.credentialRecordId, credentialRecordId))
    .returning();
  return row ? toCredentialLean(row) : null;
}

export async function deletePasskeyCredential(
  db: BehalfPostgresDb,
  userId: string,
  credentialRecordId: string
): Promise<PasskeyCredentialLean | null> {
  const [row] = await db
    .delete(passkeyCredentials)
    .where(
      and(
        eq(passkeyCredentials.userId, userId),
        eq(passkeyCredentials.credentialRecordId, credentialRecordId)
      )
    )
    .returning();
  return row ? toCredentialLean(row) : null;
}

export async function createWebAuthnChallenge(
  db: BehalfPostgresDb,
  input: CreateWebAuthnChallengeInput
): Promise<WebAuthnChallengeLean> {
  try {
    const [row] = await db
      .insert(webauthnChallenges)
      .values({
        challengeId: input.challengeId,
        challengeHash: input.challengeHash,
        kind: input.kind,
        userId: input.userId ?? null,
        consumedAt: null,
        expiresAt: input.expiresAt
      })
      .returning();
    if (!row) throw new Error("createWebAuthnChallenge failed to return a row");
    return toChallengeLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

/**
 * Atomically consume a WebAuthn challenge.
 * Returns null when missing, expired, wrong kind/user, or already used.
 */
export async function consumeWebAuthnChallenge(
  db: BehalfPostgresDb,
  options: {
    challengeHash: string;
    kind: WebAuthnChallengeKind;
    userId?: string | null;
    now?: Date;
  }
): Promise<WebAuthnChallengeLean | null> {
  const now = options.now ?? new Date();
  const conditions = [
    eq(webauthnChallenges.challengeHash, options.challengeHash),
    eq(webauthnChallenges.kind, options.kind),
    isNull(webauthnChallenges.consumedAt),
    gt(webauthnChallenges.expiresAt, now)
  ];
  if (options.userId) {
    conditions.push(eq(webauthnChallenges.userId, options.userId));
  }

  const [row] = await db
    .update(webauthnChallenges)
    .set({ consumedAt: now })
    .where(and(...conditions))
    .returning();
  return row ? toChallengeLean(row) : null;
}

export async function deleteExpiredWebAuthnChallenges(db: BehalfPostgresDb, before = new Date()) {
  const rows = await db
    .delete(webauthnChallenges)
    .where(lte(webauthnChallenges.expiresAt, before))
    .returning({ challengeId: webauthnChallenges.challengeId });
  return { acknowledged: true, deletedCount: rows.length };
}
