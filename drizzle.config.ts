import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for the app Postgres schema.
 *
 * Expects DATABASE_URL or POSTGRES_URL at migration/generate time.
 * Normal `npm run build` does not load or require this file.
 */
const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export default defineConfig({
  schema: "./lib/db/postgres/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "postgresql://127.0.0.1:5432/postgres"
  },
  strict: true,
  verbose: true
});
