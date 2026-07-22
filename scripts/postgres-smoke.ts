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
  "status_incidents",
  "policy_documents",
  "integration_bindings",
  "collaboration_message_refs"
] as const;

/** Indexes that must exist after the full migration chain (by stable SQL name). */
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
  // Non-unique managed_profile_pause lookup (Mongo parity — the stricter unique
  // index from 0000 is dropped by 0004). Proves the intended lookup stays indexed.
  "approval_requests_pause_pending_lookup_idx",
  "approval_requests_grant_lookup_idx",
  "verification_logs_account_created_idx",
  "verification_logs_account_agent_created_idx",
  "verification_logs_agent_created_idx",
  "verification_logs_allowed_idx",
  "managed_profile_protected_repos_account_repo_uq",
  "webhook_events_status_next_attempt_created_idx",
  "cli_audit_activities_account_created_idx",
  "sites_account_domain_uq",
  "site_guard_keys_key_hash_unique",
  "device_codes_device_code_unique",
  "device_codes_user_code_unique",
  "policy_documents_account_id_unique",
  "integration_bindings_account_provider_team_channel_uq",
  "collaboration_message_refs_account_approval_provider_uq"
] as const;

export const VERIFICATION_LOG_MAINTENANCE_FUNCTIONS = [
  "behalf_ensure_verification_log_partitions",
  "behalf_purge_verification_logs",
  "behalf_drop_expired_verification_log_partitions",
  "behalf_run_verification_log_retention",
  "behalf_schedule_verification_log_maintenance"
] as const;

export const TTL_CLEANUP_FUNCTIONS = [
  "behalf_purge_expired_developer_sessions",
  "behalf_purge_expired_device_codes",
  "behalf_purge_expired_oauth_pending_signups",
  "behalf_run_ttl_cleanup",
  "behalf_schedule_ttl_cleanup"
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
    join(process.cwd(), "drizzle/0003_schema_parity.sql"),
    join(process.cwd(), "drizzle/0004_managed_profile_pause_index_parity.sql"),
    join(process.cwd(), "drizzle/0005_policy_and_integrations.sql")
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
  await sql`TRUNCATE webhook_deliveries, webhook_events, webhook_endpoints, verification_logs, approval_requests, permissions, account_invites, account_memberships, agents, developer_users, accounts CASCADE`;
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
  ttlCleanupFunctions: string[];
  ttlCleanupPurgedSessions: number;
  ttlCleanupRemainingSessionIds: string[];
  ttlCronSkippedWhenUnavailable: boolean;
  approvalPendingUniqueIncludesFingerprint: boolean;
  managedProfilePausePendingUniqueDropped: boolean;
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

    const maintenanceFunctionRows = await sql<{ proname: string }[]>`
      SELECT DISTINCT procedure.proname
      FROM pg_proc AS procedure
      JOIN pg_namespace AS procedure_namespace ON procedure_namespace.oid = procedure.pronamespace
      WHERE procedure_namespace.nspname = ${schemaName}
        AND procedure.proname = ANY(${VERIFICATION_LOG_MAINTENANCE_FUNCTIONS as unknown as string[]})
      ORDER BY procedure.proname
    `;

    const ttlFunctionRows = await sql<{ proname: string }[]>`
      SELECT DISTINCT procedure.proname
      FROM pg_proc AS procedure
      JOIN pg_namespace AS procedure_namespace ON procedure_namespace.oid = procedure.pronamespace
      WHERE procedure_namespace.nspname = ${schemaName}
        AND procedure.proname = ANY(${TTL_CLEANUP_FUNCTIONS as unknown as string[]})
      ORDER BY procedure.proname
    `;

    const [approvalPendingIndex] = await sql<{ indexdef: string }[]>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = ${schemaName}
        AND indexname = 'approval_requests_agent_action_pending_uq'
    `;
    const approvalPendingUniqueIncludesFingerprint = Boolean(
      approvalPendingIndex?.indexdef.includes("argument_fingerprint")
    );

    const [managedProfilePausePendingUnique] = await sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = ${schemaName}
        AND indexname = 'approval_requests_managed_profile_pause_pending_uq'
    `;
    const managedProfilePausePendingUniqueDropped = !managedProfilePausePendingUnique;

    await sql`
      INSERT INTO ${sql(schemaName)}.accounts (account_id, name, plan)
      VALUES ('acct_retention_smoke', 'Retention smoke', 'free')
    `;
    await sql`
      INSERT INTO ${sql(schemaName)}.developer_users (
        user_id, email, password_hash, onboarding_use_case
      )
      VALUES ('user_ttl_smoke', 'ttl-smoke@example.com', 'hash', 'sdk')
    `;
    await sql`
      INSERT INTO ${sql(schemaName)}.developer_sessions (
        session_id, user_id, token_hash, expires_at, last_activity_at, created_at
      )
      VALUES
        (
          'sess_ttl_expired',
          'user_ttl_smoke',
          'token_hash_expired',
          CURRENT_TIMESTAMP - interval '1 hour',
          CURRENT_TIMESTAMP - interval '2 hours',
          CURRENT_TIMESTAMP - interval '2 hours'
        ),
        (
          'sess_ttl_current',
          'user_ttl_smoke',
          'token_hash_current',
          CURRENT_TIMESTAMP + interval '1 hour',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
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

    const [ttlCleanupResult] = await sql<{
      result: {
        developerSessions: number;
        deviceCodes: number;
        oauthPendingSignups: number;
      };
    }[]>`
      SELECT ${sql(schemaName)}.behalf_run_ttl_cleanup(${schemaName}, 100) AS result
    `;
    const remainingTtlSessions = await sql<{ session_id: string }[]>`
      SELECT session_id
      FROM ${sql(schemaName)}.developer_sessions
      WHERE user_id = 'user_ttl_smoke'
      ORDER BY session_id
    `;
    const [ttlCronScheduleResult] = await sql<{ scheduled: boolean }[]>`
      SELECT ${sql(schemaName)}.behalf_schedule_ttl_cleanup(${schemaName}) AS scheduled
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
      verificationLogCronSkippedWhenUnavailable: cronScheduleResult?.scheduled === false,
      ttlCleanupFunctions: ttlFunctionRows.map((row) => row.proname),
      ttlCleanupPurgedSessions: Number(ttlCleanupResult?.result.developerSessions ?? 0),
      ttlCleanupRemainingSessionIds: remainingTtlSessions.map((row) => row.session_id),
      ttlCronSkippedWhenUnavailable: ttlCronScheduleResult?.scheduled === false,
      approvalPendingUniqueIncludesFingerprint,
      managedProfilePausePendingUniqueDropped
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

  const missingTtlFunctions = TTL_CLEANUP_FUNCTIONS.filter(
    (name) => !result.ttlCleanupFunctions.includes(name)
  );
  if (missingTtlFunctions.length > 0) {
    throw new Error(`Missing TTL cleanup functions: ${missingTtlFunctions.join(", ")}`);
  }
  if (result.ttlCleanupPurgedSessions !== 1) {
    throw new Error(
      `Expected TTL cleanup to purge one session, got ${result.ttlCleanupPurgedSessions}`
    );
  }
  if (
    result.ttlCleanupRemainingSessionIds.length !== 1 ||
    result.ttlCleanupRemainingSessionIds[0] !== "sess_ttl_current"
  ) {
    throw new Error("TTL cleanup removed the wrong developer sessions");
  }
  if (!result.ttlCronSkippedWhenUnavailable) {
    throw new Error("TTL pg_cron scheduler should return false when pg_cron is unavailable");
  }
  if (!result.approvalPendingUniqueIncludesFingerprint) {
    throw new Error(
      "approval_requests_agent_action_pending_uq must include argument_fingerprint"
    );
  }
  if (!result.managedProfilePausePendingUniqueDropped) {
    throw new Error(
      "approval_requests_managed_profile_pause_pending_uq must be dropped (Mongo parity — non-unique)"
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
