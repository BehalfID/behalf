/** Public facade for external identities — Postgres cutover (no Mongo twin). */
import { getPostgresDb } from "@/lib/db/postgres";
import * as pg from "@/lib/repositories/postgres/externalIdentities";

export type {
  ExternalIdentityLean,
  ExternalIdentityProvider,
  CreateExternalIdentityInput
} from "@/lib/repositories/postgres/externalIdentities";

export async function findByProviderAccount(
  provider: pg.ExternalIdentityProvider,
  providerAccountId: string
) {
  return pg.findByProviderAccount(getPostgresDb(), provider, providerAccountId);
}

export async function listByUserId(userId: string) {
  return pg.listByUserId(getPostgresDb(), userId);
}

export async function findByUserAndProvider(
  userId: string,
  provider: pg.ExternalIdentityProvider
) {
  return pg.findByUserAndProvider(getPostgresDb(), userId, provider);
}

export async function existsByProviderAccount(
  provider: pg.ExternalIdentityProvider,
  providerAccountId: string
) {
  return pg.existsByProviderAccount(getPostgresDb(), provider, providerAccountId);
}

export async function createExternalIdentity(input: pg.CreateExternalIdentityInput) {
  return pg.createExternalIdentity(getPostgresDb(), input);
}

export async function deleteByUserAndProvider(
  userId: string,
  provider: pg.ExternalIdentityProvider
) {
  return pg.deleteByUserAndProvider(getPostgresDb(), userId, provider);
}

export async function touchLoginMetadata(
  provider: pg.ExternalIdentityProvider,
  providerAccountId: string,
  set: {
    lastLoginAt: Date;
    providerUsername?: string | null;
    providerEmail?: string | null;
    providerEmailVerified?: boolean;
  }
) {
  return pg.touchLoginMetadata(getPostgresDb(), provider, providerAccountId, set);
}
