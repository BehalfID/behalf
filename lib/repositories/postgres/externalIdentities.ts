import { and, eq } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { externalIdentities } from "@/lib/db/postgres/schema";
import { normalizeEmail } from "@/lib/developerAuth";
import { translatePostgresError } from "@/lib/repositories/errors";

export type ExternalIdentityProvider = "github" | "google";

export type ExternalIdentityLean = {
  identityId: string;
  userId: string;
  provider: ExternalIdentityProvider;
  providerAccountId: string;
  providerUsername: string | null;
  providerEmail: string | null;
  providerEmailVerified: boolean;
  linkedAt: Date;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateExternalIdentityInput = {
  identityId: string;
  userId: string;
  provider: ExternalIdentityProvider;
  providerAccountId: string;
  providerUsername?: string | null;
  providerEmail?: string | null;
  providerEmailVerified?: boolean;
  linkedAt?: Date;
  lastLoginAt?: Date | null;
};

type IdentityRow = typeof externalIdentities.$inferSelect;

function toLean(row: IdentityRow): ExternalIdentityLean {
  return {
    identityId: row.identityId,
    userId: row.userId,
    provider: row.provider as ExternalIdentityProvider,
    providerAccountId: row.providerAccountId,
    providerUsername: row.providerUsername ?? null,
    providerEmail: row.providerEmail ?? null,
    providerEmailVerified: row.providerEmailVerified,
    linkedAt: row.linkedAt,
    lastLoginAt: row.lastLoginAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function findByProviderAccount(
  db: BehalfPostgresDb,
  provider: ExternalIdentityProvider,
  providerAccountId: string
): Promise<ExternalIdentityLean | null> {
  const row =
    (await db.query.externalIdentities.findFirst({
      where: and(
        eq(externalIdentities.provider, provider),
        eq(externalIdentities.providerAccountId, providerAccountId)
      )
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function listByUserId(
  db: BehalfPostgresDb,
  userId: string
): Promise<ExternalIdentityLean[]> {
  const rows = await db
    .select()
    .from(externalIdentities)
    .where(eq(externalIdentities.userId, userId));
  return rows.map(toLean);
}

export async function findByUserAndProvider(
  db: BehalfPostgresDb,
  userId: string,
  provider: ExternalIdentityProvider
): Promise<ExternalIdentityLean | null> {
  const row =
    (await db.query.externalIdentities.findFirst({
      where: and(eq(externalIdentities.userId, userId), eq(externalIdentities.provider, provider))
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function existsByProviderAccount(
  db: BehalfPostgresDb,
  provider: ExternalIdentityProvider,
  providerAccountId: string
): Promise<boolean> {
  const row = await db.query.externalIdentities.findFirst({
    where: and(
      eq(externalIdentities.provider, provider),
      eq(externalIdentities.providerAccountId, providerAccountId)
    ),
    columns: { identityId: true }
  });
  return Boolean(row);
}

export async function createExternalIdentity(
  db: BehalfPostgresDb,
  input: CreateExternalIdentityInput
): Promise<ExternalIdentityLean> {
  try {
    const [row] = await db
      .insert(externalIdentities)
      .values({
        identityId: input.identityId,
        userId: input.userId,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        providerUsername: input.providerUsername ?? null,
        providerEmail: input.providerEmail ? normalizeEmail(input.providerEmail) : null,
        providerEmailVerified: input.providerEmailVerified ?? false,
        linkedAt: input.linkedAt ?? new Date(),
        lastLoginAt: input.lastLoginAt ?? null
      })
      .returning();
    if (!row) throw new Error("createExternalIdentity failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function deleteByUserAndProvider(
  db: BehalfPostgresDb,
  userId: string,
  provider: ExternalIdentityProvider
) {
  const rows = await db
    .delete(externalIdentities)
    .where(and(eq(externalIdentities.userId, userId), eq(externalIdentities.provider, provider)))
    .returning({ identityId: externalIdentities.identityId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function touchLoginMetadata(
  db: BehalfPostgresDb,
  provider: ExternalIdentityProvider,
  providerAccountId: string,
  set: {
    lastLoginAt: Date;
    providerUsername?: string | null;
    providerEmail?: string | null;
    providerEmailVerified?: boolean;
  }
) {
  const rows = await db
    .update(externalIdentities)
    .set({
      lastLoginAt: set.lastLoginAt,
      providerUsername: set.providerUsername ?? null,
      providerEmail: set.providerEmail ? normalizeEmail(set.providerEmail) : null,
      providerEmailVerified: set.providerEmailVerified ?? false,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(externalIdentities.provider, provider),
        eq(externalIdentities.providerAccountId, providerAccountId)
      )
    )
    .returning({ identityId: externalIdentities.identityId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}
