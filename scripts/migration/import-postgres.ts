/**
 * PR C — Postgres import scaffold (COPY-style bulk load from NDJSON).
 *
 * Usage:
 *   DATABASE_URL=... tsx scripts/migration/import-postgres.ts --in ./migration-export
 *
 * Loads files in FK order with ON CONFLICT DO NOTHING. Does not cut over runtime.
 */

import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import postgres from "postgres";
import { EXPORT_COLLECTION_ORDER, type ExportCollectionName } from "./transform";

function parseInDir(argv: string[]): string {
  const idx = argv.indexOf("--in");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]!;
  return join(process.cwd(), "migration-export");
}

async function readNdjson(path: string): Promise<Record<string, unknown>[]> {
  if (!existsSync(path)) return [];
  const rows: Record<string, unknown>[] = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(JSON.parse(trimmed) as Record<string, unknown>);
  }
  return rows;
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function importCollection(
  sql: ReturnType<typeof postgres>,
  collection: ExportCollectionName,
  inDir: string
): Promise<number> {
  const path = join(inDir, `${collection}.ndjson`);
  const rows = await readNdjson(path);
  if (rows.length === 0) return 0;

  let imported = 0;
  for (const row of rows) {
    const columns = Object.keys(row);
    if (columns.length === 0) continue;
    const colSql = columns.map(quoteIdent).join(", ");
    const values = columns.map((column) => row[column]);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    await sql.unsafe(
      `INSERT INTO ${quoteIdent(collection)} (${colSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      values as (string | number | boolean | null | Date)[]
    );
    imported += 1;
  }
  return imported;
}

export async function runImport(inDir: string, databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15
  });

  try {
    const summary: Array<{ collection: string; rows: number }> = [];
    for (const collection of EXPORT_COLLECTION_ORDER) {
      const rows = await importCollection(sql, collection, inDir);
      summary.push({ collection, rows });
    }
    return summary;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required for import-postgres.ts");
  }

  const inDir = parseInDir(process.argv.slice(2));
  if (!existsSync(inDir)) {
    throw new Error(`Import directory not found: ${inDir}`);
  }

  const summary = await runImport(inDir, databaseUrl);
  const summaryPath = join(inDir, "import-summary.json");
  // eslint-disable-next-line no-console
  console.log(`Imported collections from ${inDir}`);
  // Prefer writing beside export artifacts when present.
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  } catch {
    // ignore write failures in read-only environments
  }
  for (const entry of summary) {
    // eslint-disable-next-line no-console
    console.log(`  ${entry.collection}: ${entry.rows}`);
  }
}

const isDirectRun = process.argv[1]?.includes("import-postgres");
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
