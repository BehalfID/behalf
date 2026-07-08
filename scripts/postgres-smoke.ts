/**
 * Optional Postgres migration smoke test runner.
 *
 * Applies drizzle/0000_initial_behalf_schema.sql inside a disposable temporary schema,
 * verifies core tables / RLS / indexes, then drops the schema.
 *
 * NOT wired to app runtime. Requires a disposable Postgres database URL.
 *
 * Usage:
 *   POSTGRES_TEST_URL=postgres://... npm run test:postgres-smoke
 *   POSTGRES_TEST_URL=postgres://... tsx scripts/postgres-smoke.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import * as schema from "@/lib/db/postgres/schema";

export const CORE_TABLES = [
  "accounts",
  "developer_users",
  "developer_sessions",
  "developer_api_tokens",
  "account_memberships",
  "account_invites",
  "agents",
  "permissions",
  "approval_requests",
  "verification_logs",
  "webhook_endpoints",
  "webhook_events",
  "managed_profile_policies",
  "managed_profile_protected_repos",
  "cli_audit_activities"
] as const;

/** Indexes that must exist after the v1 migration (by stable SQL name). */
export const CRITICAL_INDEX_NAMES = [
  "accounts_plan_idx",
  "accounts_stripe_customer_id_uq",
  "developer_users_email_lower_uq",
  "account_memberships_account_user_uq",
  "account_invites_account_email_status_uq",
  "agents_account_status_idx",
  "permissions_agent_status_idx",
  "approval_requests_agent_action_pending_uq",
  "approval_requests_managed_profile_pause_pending_uq",
  "verification_logs_account_created_idx",
  "verification_logs_account_agent_created_idx",
  "verification_logs_agent_created_idx",
  "verification_logs_allowed_idx",
  "managed_profile_protected_repos_account_repo_uq",
  "webhook_events_status_next_attempt_created_idx",
  "cli_audit_activities_account_created_idx"
] as const;

export function resolveSmokeTestUrl(): string | undefined {
  return process.env.POSTGRES_TEST_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
}

export function isSmokeTestEnabled(): boolean {
  return process.env.RUN_POSTGRES_MIGRATION_SMOKE === "true" && Boolean(resolveSmokeTestUrl());
}

export function isPostgresRepositoryContractsEnabled(): boolean {
  return (
    process.env.RUN_POSTGRES_REPOSITORY_CONTRACTS === "true" && Boolean(resolveSmokeTestUrl())
  );
}

function migrationSqlPath(): string {
  return join(process.cwd(), "drizzle/0000_initial_behalf_schema.sql");
}

function createSmokeSchemaName(): string {
  return `behalf_smoke_${Date.now()}`;
}

function createContractSchemaName(): string {
  return `behalf_contract_${Date.now()}`;
}

export type PostgresContractTestContext = {
  schemaName: string;
  db: BehalfPostgresDb;
  sql: ReturnType<typeof postgres>;
  cleanup: () => Promise<void>;
};

/** Applies the v1 migration inside a disposable schema for repository contract tests. */
export async function setupPostgresContractTestSchema(
  url?: string
): Promise<PostgresContractTestContext> {
  const connectionUrl = url ?? resolveSmokeTestUrl();
  if (!connectionUrl) {
    throw new Error(
      "Postgres repository contract tests require POSTGRES_TEST_URL, DATABASE_URL, or POSTGRES_URL."
    );
  }

  const schemaName = createContractSchemaName();
  const sql = postgres(connectionUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15
  });

  const migrationSql = readFileSync(migrationSqlPath(), "utf8");

  await sql`CREATE SCHEMA ${sql(schemaName)}`;
  await sql`SET search_path TO ${sql(schemaName)}`;
  await sql.unsafe(migrationSql);

  const db = drizzle(sql, { schema });

  return {
    schemaName,
    db,
    sql,
    cleanup: async () => {
      try {
        await sql`DROP SCHEMA IF EXISTS ${sql(schemaName)} CASCADE`;
      } catch {
        // Best-effort cleanup; connection may already be closed.
      }
      await sql.end({ timeout: 5 });
    }
  };
}

/** Clears contract-test seed data between examples without dropping the schema. */
export async function truncatePostgresContractTables(
  sql: ReturnType<typeof postgres>,
  schemaName: string
): Promise<void> {
  await sql`SET search_path TO ${sql(schemaName)}`;
  await sql`TRUNCATE accounts, agents CASCADE`;
}

export type SmokeTestResult = {
  schemaName: string;
  tables: string[];
  indexes: string[];
  rlsEnabledTables: string[];
  verificationLogsUnpartitioned: boolean;
};

export async function runPostgresMigrationSmoke(url?: string): Promise<SmokeTestResult> {
  const connectionUrl = url ?? resolveSmokeTestUrl();
  if (!connectionUrl) {
    throw new Error(
      "Postgres smoke test requires POSTGRES_TEST_URL, DATABASE_URL, or POSTGRES_URL."
    );
  }

  const schemaName = createSmokeSchemaName();
  const sql = postgres(connectionUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15
  });

  try {
    const migrationSql = readFileSync(migrationSqlPath(), "utf8");

    await sql`CREATE SCHEMA ${sql(schemaName)}`;
    await sql`SET search_path TO ${sql(schemaName)}`;
    await sql.unsafe(migrationSql);

    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${schemaName}
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const rlsRows = await sql<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schemaName}
        AND c.relkind = 'r'
        AND c.relrowsecurity = true
      ORDER BY c.relname
    `;

    const indexRows = await sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = ${schemaName}
      ORDER BY indexname
    `;

    const [verificationLogsRow] = await sql<{ relkind: string }[]>`
      SELECT c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schemaName}
        AND c.relname = 'verification_logs'
    `;

    const childPartitions = await sql<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_inherits i ON i.inhrelid = c.oid
      JOIN pg_class parent ON parent.oid = i.inhparent
      JOIN pg_namespace n ON n.oid = parent.relnamespace
      WHERE n.nspname = ${schemaName}
        AND parent.relname = 'verification_logs'
    `;

    const verificationLogsUnpartitioned =
      verificationLogsRow?.relkind === "r" && childPartitions.length === 0;

    return {
      schemaName,
      tables: tables.map((row) => row.table_name),
      indexes: indexRows.map((row) => row.indexname),
      rlsEnabledTables: rlsRows.map((row) => row.relname),
      verificationLogsUnpartitioned
    };
  } finally {
    try {
      await sql`DROP SCHEMA IF EXISTS ${sql(schemaName)} CASCADE`;
    } catch {
      // Best-effort cleanup; connection may already be closed.
    }
    await sql.end({ timeout: 5 });
  }
}

export async function assertSmokeTestExpectations(result: SmokeTestResult): Promise<void> {
  const missingTables = CORE_TABLES.filter((name) => !result.tables.includes(name));
  if (missingTables.length > 0) {
    throw new Error(`Missing core tables: ${missingTables.join(", ")}`);
  }

  const missingRls = CORE_TABLES.filter((name) => !result.rlsEnabledTables.includes(name));
  if (missingRls.length > 0) {
    throw new Error(`RLS not enabled on: ${missingRls.join(", ")}`);
  }

  const missingIndexes = CRITICAL_INDEX_NAMES.filter((name) => !result.indexes.includes(name));
  if (missingIndexes.length > 0) {
    throw new Error(`Missing critical indexes: ${missingIndexes.join(", ")}`);
  }

  if (!result.indexes.includes("managed_profile_protected_repos_account_repo_uq")) {
    throw new Error("managed_profile_protected_repos unique (account_id, repo_hash) index missing");
  }

  if (!result.verificationLogsUnpartitioned) {
    throw new Error(
      "verification_logs must exist and remain unpartitioned in v1 (ordinary table, no child partitions)"
    );
  }
}

async function main(): Promise<void> {
  const url = resolveSmokeTestUrl();
  if (!url) {
    console.error(
      "Set POSTGRES_TEST_URL (preferred) or DATABASE_URL to a disposable Postgres database."
    );
    process.exit(1);
  }

  const result = await runPostgresMigrationSmoke(url);
  await assertSmokeTestExpectations(result);

  console.log("Postgres migration smoke test passed.");
  console.log(`Verified ${result.tables.length} tables, RLS on ${result.rlsEnabledTables.length} tables.`);
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
