/**
 * Postgres connection module for Drizzle — schema/migration tooling and future repository adapters.
 *
 * NOT wired to app runtime. Production still uses Mongo/Mongoose via lib/db.ts.
 * Import this module only from migration scripts, drizzle-kit, or test-only Postgres adapters.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/postgres/schema";

export type BehalfPostgresDb = PostgresJsDatabase<typeof schema>;

type GlobalPostgresCache = {
  client?: ReturnType<typeof postgres>;
  db?: BehalfPostgresDb;
};

const globalForPostgres = globalThis as typeof globalThis & {
  __behalfPostgres?: GlobalPostgresCache;
};

function resolveDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
}

/**
 * Returns a cached Drizzle client when DATABASE_URL or POSTGRES_URL is set.
 * Throws only when called without a URL — callers should guard with isPostgresConfigured().
 */
export function getPostgresDb(): BehalfPostgresDb {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      "Postgres is not configured. Set DATABASE_URL or POSTGRES_URL to use getPostgresDb()."
    );
  }

  if (!globalForPostgres.__behalfPostgres) {
    globalForPostgres.__behalfPostgres = {};
  }

  const cache = globalForPostgres.__behalfPostgres;

  if (!cache.client) {
    cache.client = postgres(url, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10
    });
  }

  if (!cache.db) {
    cache.db = drizzle(cache.client, { schema });
  }

  return cache.db;
}

/** True when a Postgres URL is present in the environment. */
export function isPostgresConfigured(): boolean {
  return Boolean(resolveDatabaseUrl());
}

export { schema };
export * from "@/lib/db/postgres/schema";
export * from "@/lib/db/postgres/enums";
