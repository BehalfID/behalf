/**
 * Import NDJSON (from export-mongo) into Postgres (PR C).
 *
 * Usage:
 *   DATABASE_URL=... npm run migration:import -- --in ./migration-data
 *
 * FK-ordered INSERT via postgres.js with ON CONFLICT DO NOTHING (idempotent re-runs).
 * Imports every table in POSTGRES_IMPORT_TABLES (includes policy_documents /
 * integration_bindings / collaboration_message_refs after drizzle/0005).
 *
 * Import order (see EXPORT_TABLE_ORDER / comments below):
 *   accounts → developer_users → oauth_pending_signups → developer_sessions →
 *   developer_api_tokens → account_memberships → account_invites → device_codes →
 *   agents → permissions → permission_profiles → approval_requests →
 *   webhook_endpoints → webhook_events → managed_profile_policies →
 *   managed_profile_protected_repos → cli_pause_leases → sites →
 *   site_access_rules → site_guard_keys → stripe_webhook_events →
 *   enterprise_inquiries → status_components → status_incidents →
 *   verification_logs → webhook_deliveries → cli_audit_activities →
 *   site_access_logs → policy_documents → integration_bindings →
 *   collaboration_message_refs
 */

import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
import {
  EXPORT_TABLE_ORDER,
  POSTGRES_IMPORT_TABLES,
  ndjsonPath,
  type ExportTableName
} from "./lib/transform";

config({ path: ".env.local" });
config();

const BATCH_SIZE = 200;

function parseInDir(argv: string[]): string {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--in") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--in requires a directory path.");
      }
      return path.resolve(value);
    }
  }
  throw new Error("Missing required --in <directory>.");
}

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL (or POSTGRES_URL) environment variable.");
  }
  return url;
}

async function* readNdjson(filePath: string): AsyncGenerator<Record<string, unknown>> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    yield JSON.parse(trimmed) as Record<string, unknown>;
  }
}

async function loadTableColumns(
  sql: postgres.Sql,
  table: string
): Promise<Set<string>> {
  const rows = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = ${table}
  `;
  return new Set(rows.map((row) => row.column_name));
}

function coerceCell(column: string, value: unknown): unknown {
  if (value === undefined) return null;
  // Postgres numeric columns reject some JSON number edge cases; stringify amounts.
  if (
    (column === "amount" || column.endsWith("_amount")) &&
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }
  return value;
}

async function insertBatch(
  sql: postgres.Sql,
  table: string,
  rows: Record<string, unknown>[],
  allowedColumns: Set<string>
): Promise<number> {
  if (rows.length === 0) return 0;

  const columns = [
    ...new Set(
      rows.flatMap((row) => Object.keys(row).filter((key) => allowedColumns.has(key)))
    )
  ].sort();
  if (columns.length === 0) return 0;

  const normalized = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of columns) {
      out[col] = coerceCell(col, row[col]);
    }
    return out;
  });

  // ON CONFLICT DO NOTHING: any unique/PK conflict is skipped (idempotent).
  await sql`
    insert into ${sql(table)} ${sql(normalized, ...columns)}
    on conflict do nothing
  `;
  return rows.length;
}

export async function runImport(inDir: string): Promise<Record<string, number>> {
  const databaseUrl = resolveDatabaseUrl();
  const sql = postgres(databaseUrl, { max: 1 });
  const counts: Record<string, number> = {};
  const columnCache = new Map<string, Set<string>>();

  try {
    for (const table of EXPORT_TABLE_ORDER) {
      if (!POSTGRES_IMPORT_TABLES.has(table)) {
        console.log(`skip ${table} (not in POSTGRES_IMPORT_TABLES)`);
        continue;
      }

      const filePath = ndjsonPath(inDir, table);
      try {
        await access(filePath);
      } catch {
        console.log(`skip ${table} (missing ${filePath})`);
        continue;
      }

      let allowedColumns = columnCache.get(table);
      if (!allowedColumns) {
        allowedColumns = await loadTableColumns(sql, table);
        columnCache.set(table, allowedColumns);
      }
      if (allowedColumns.size === 0) {
        console.log(`skip ${table} (no columns found in current schema)`);
        continue;
      }

      let attempted = 0;
      let batch: Record<string, unknown>[] = [];

      for await (const row of readNdjson(filePath)) {
        batch.push(row);
        if (batch.length >= BATCH_SIZE) {
          attempted += await insertBatch(sql, table, batch, allowedColumns);
          batch = [];
        }
      }
      if (batch.length > 0) {
        attempted += await insertBatch(sql, table, batch, allowedColumns);
      }

      const [{ count }] = await sql<{ count: string }[]>`
        select count(*)::text as count from ${sql(table)}
      `;
      counts[table] = Number(count);
      console.log(`${table}: read ${attempted} NDJSON rows; table count=${count}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  return counts;
}

async function main() {
  const inDir = parseInDir(process.argv.slice(2));
  console.log(`Importing NDJSON from ${inDir} → Postgres`);
  await runImport(inDir);
  console.log("Done.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export type { ExportTableName };
