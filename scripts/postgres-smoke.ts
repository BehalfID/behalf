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
  "oauth_pending_signups",
  "developer_sessions",
  "developer_api_tokens",
  "account_memberships",
  "account_invites",
  "device_codes",
  "agents",
  "permissions",
  "permission_profiles",
  "approval_requests",
  "verification_logs",
  "webhook_endpoints",
  "webhook_events",
  "webhook_deliveries",
  "stripe_webhook_events",
  "enterprise_inquiries",
  "managed_profile_policies",
  "managed_profile_protected_repos",
  "cli_pause_leases",
  "cli_audit_activities",
  "sites",
  "site_access_rules",
  "site_access_logs",
  "site_guard_keys",
  "status_components",
  "status_incidents"
] as const;

/** Indexes that must exist after migrations (by stable SQL name). */
export const CRITICAL_INDEX_NAMES = [
  "accounts_plan_idx",
  "accounts_slug_uq",
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
  "cli_audit_activities_account_created_idx",
  "device_codes_expires_at_idx",
  "permission_profiles_account_status_idx",
  "sites_account_domain_uq",
  "cli_pause_leases_account_user_expires_idx"
] as const;

export const VERIFICATION_LOG_MAINTENANCE_FUNCTIONS = [
  "behalf_ensure_verification_log_partitions",
  "behalf_purge_verification_logs",
  "behalf_drop_expired_verification_log_partitions",
  "behalf_run_verification_log_retention",
  "behalf_schedule_verification_log_maintenance"
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

function migrationSqlPaths(): string[] {
  return [
    join(process.cwd(), "drizzle/0000_initial_behalf_schema.sql"),
    join(process.cwd(), "drizzle/0001_workspace_slug.sql"),
    join(process.cwd(), "drizzle/0002_google_sso.sql"),
    join(process.cwd(), "drizzle/0003_remaining_tables.sql"),
    join(process.cwd(), "drizzle/0004_approval_argument_binding.sql")
  ];
}

function readMigrationSql(): string {
  return migrationSqlPaths()
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
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

  const migrationSql = readMigrationSql();

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
  await sql`TRUNCATE account_invites, account_memberships, agents, developer_users, accounts CASCADE`;
}

export type SmokeTestResult = {
  schemaName: string;
  tables: string[];
  indexes: string[];
  rlsEnabledTables: string[];
  verificationLogsPartitioned: boolean;
  verificationLogPartitions: string[];
  verificationLogCompositePrimaryKey: boolean;
  verificationLogCompositeRequestUnique: boolean;
  verificationLogMaintenanceFunctions: string[];
  verificationLogRetentionPurgedRows: number;
  verificationLogRetentionRemainingIds: string[];
  verificationLogCronSkippedWhenUnavailable: boolean;
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
    const migrationSql = readMigrationSql();

    await sql`CREATE SCHEMA ${sql(schemaName)}`;
    await sql`SET search_path TO ${sql(schemaName)}`;
    await sql.unsafe(migrationSql);

    const tables = await sql<{ table_name: string }[]>`
      SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schemaName}
        AND c.relkind IN ('r', 'p')
        AND NOT EXISTS (
          SELECT 1 FROM pg_inherits WHERE inhrelid = c.oid
        )
      ORDER BY c.relname
    `;

    const rlsRows = await sql<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schemaName}
        AND c.relkind IN ('r', 'p')
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
      ORDER BY c.relname
    `;

    const constraintRows = await sql<{ contype: string; definition: string }[]>`
      SELECT con.contype, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint AS con
      JOIN pg_class AS table_class ON table_class.oid = con.conrelid
      JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
      WHERE table_namespace.nspname = ${schemaName}
        AND table_class.relname = 'verification_logs'
        AND con.contype IN ('p', 'u')
    `;

    const maintenanceFunctionRows = await sql<{ proname: string }[]>`
      SELECT DISTINCT procedure.proname
      FROM pg_proc AS procedure
      JOIN pg_namespace AS procedure_namespace ON procedure_namespace.oid = procedure.pronamespace
      WHERE procedure_namespace.nspname = ${schemaName}
        AND procedure.proname = ANY(${VERIFICATION_LOG_MAINTENANCE_FUNCTIONS as unknown as string[]})
      ORDER BY procedure.proname
    `;

    const normalizedConstraints = constraintRows.map((row) => ({
      ...row,
      definition: row.definition.replace(/"/g, "").replace(/\s+/g, " ")
    }));
    const verificationLogsPartitioned =
      verificationLogsRow?.relkind === "p" && childPartitions.length > 1;
    const verificationLogCompositePrimaryKey = normalizedConstraints.some(
      (row) => row.contype === "p" && row.definition === "PRIMARY KEY (log_id, created_at)"
    );
    const verificationLogCompositeRequestUnique = normalizedConstraints.some(
      (row) => row.contype === "u" && row.definition === "UNIQUE (request_id, created_at)"
    );

    await sql`
      INSERT INTO ${sql(schemaName)}.accounts (account_id, name, plan)
      VALUES ('acct_retention_smoke', 'Retention smoke', 'free')
    `;
    await sql`
      INSERT INTO ${sql(schemaName)}.verification_logs (
        log_id,
        request_id,
        account_id,
        agent_id,
        action,
        allowed,
        reason,
        risk,
        created_at,
        updated_at
      )
      VALUES
        (
          'log_retention_expired',
          'req_retention_expired',
          'acct_retention_smoke',
          'agent_retention_smoke',
          'read_file',
          true,
          'expired smoke row',
          'low',
          CURRENT_TIMESTAMP - interval '40 days',
          CURRENT_TIMESTAMP - interval '40 days'
        ),
        (
          'log_retention_current',
          'req_retention_current',
          'acct_retention_smoke',
          'agent_retention_smoke',
          'read_file',
          true,
          'current smoke row',
          'low',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
    `;

    const [retentionResult] = await sql<{
      result: { purgedRows: number; droppedPartitions: number };
    }[]>`
      SELECT ${sql(schemaName)}.behalf_run_verification_log_retention(
        ${schemaName},
        100,
        30,
        1
      ) AS result
    `;
    const remainingRetentionRows = await sql<{ log_id: string }[]>`
      SELECT log_id
      FROM ${sql(schemaName)}.verification_logs
      WHERE account_id = 'acct_retention_smoke'
      ORDER BY log_id
    `;
    const [cronScheduleResult] = await sql<{ scheduled: boolean }[]>`
      SELECT ${sql(schemaName)}.behalf_schedule_verification_log_maintenance(
        ${schemaName}
      ) AS scheduled
    `;

    return {
      schemaName,
      tables: tables.map((row) => row.table_name),
      indexes: indexRows.map((row) => row.indexname),
      rlsEnabledTables: rlsRows.map((row) => row.relname),
      verificationLogsPartitioned,
      verificationLogPartitions: childPartitions.map((row) => row.relname),
      verificationLogCompositePrimaryKey,
      verificationLogCompositeRequestUnique,
      verificationLogMaintenanceFunctions: maintenanceFunctionRows.map((row) => row.proname),
      verificationLogRetentionPurgedRows: Number(retentionResult?.result.purgedRows ?? 0),
      verificationLogRetentionRemainingIds: remainingRetentionRows.map((row) => row.log_id),
      verificationLogCronSkippedWhenUnavailable: cronScheduleResult?.scheduled === false
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

  if (!result.verificationLogsPartitioned) {
    throw new Error("verification_logs must be a partitioned table with monthly child partitions");
  }

  const currentMonthPartition =
    `verification_logs_${new Date().toISOString().slice(0, 7).replace("-", "_")}`;
  if (!result.verificationLogPartitions.includes(currentMonthPartition)) {
    throw new Error(`Current verification log partition missing: ${currentMonthPartition}`);
  }
  if (!result.verificationLogPartitions.includes("verification_logs_default")) {
    throw new Error("verification_logs default partition missing");
  }
  if (!result.verificationLogCompositePrimaryKey) {
    throw new Error("verification_logs composite primary key (log_id, created_at) missing");
  }
  if (!result.verificationLogCompositeRequestUnique) {
    throw new Error("verification_logs composite request uniqueness (request_id, created_at) missing");
  }

  const missingMaintenanceFunctions = VERIFICATION_LOG_MAINTENANCE_FUNCTIONS.filter(
    (name) => !result.verificationLogMaintenanceFunctions.includes(name)
  );
  if (missingMaintenanceFunctions.length > 0) {
    throw new Error(
      `Missing verification log maintenance functions: ${missingMaintenanceFunctions.join(", ")}`
    );
  }
  if (result.verificationLogRetentionPurgedRows !== 1) {
    throw new Error(
      `Expected retention smoke to purge one row, got ${result.verificationLogRetentionPurgedRows}`
    );
  }
  if (
    result.verificationLogRetentionRemainingIds.length !== 1 ||
    result.verificationLogRetentionRemainingIds[0] !== "log_retention_current"
  ) {
    throw new Error("Verification log retention removed the wrong smoke rows");
  }
  if (!result.verificationLogCronSkippedWhenUnavailable) {
    throw new Error("pg_cron scheduler should return false when pg_cron is unavailable");
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
