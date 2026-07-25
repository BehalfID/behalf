/**
 * Optional reverse-sync helper for short rollback windows (PR E/F).
 * Lists Postgres rows written since a cutover window for manual Mongo restore.
 *
 * Usage:
 *   npx tsx scripts/migration/reverse-sync.ts --table accounts --since 2026-07-21T00:00:00Z
 *
 * Requires MONGODB_URI + DATABASE_URL. Does not switch runtime backends.
 */

import mongoose from "mongoose";
import postgres from "postgres";
import { EXPORT_TABLE_ORDER } from "./lib/transform";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const table = argValue("--table");
  const sinceRaw = argValue("--since");
  if (!table || !sinceRaw) {
    console.error(
      "Usage: npx tsx scripts/migration/reverse-sync.ts --table <postgres_table> --since <ISO>"
    );
    process.exit(1);
  }
  if (!(EXPORT_TABLE_ORDER as readonly string[]).includes(table)) {
    throw new Error(
      `Unsupported table "${table}". Allowed: ${EXPORT_TABLE_ORDER.join(", ")}`
    );
  }
  const since = new Date(sinceRaw);
  if (Number.isNaN(since.getTime())) {
    throw new Error(`Invalid --since: ${sinceRaw}`);
  }

  const mongoUri = process.env.MONGODB_URI;
  const pgUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!mongoUri || !pgUrl) {
    throw new Error("MONGODB_URI and DATABASE_URL/POSTGRES_URL are required.");
  }

  const sql = postgres(pgUrl, { max: 1, prepare: false });
  await mongoose.connect(mongoUri);

  try {
    const rows = await sql.unsafe(
      `select * from "${table}" where coalesce(updated_at, created_at) >= $1`,
      [since]
    );
    console.log(
      JSON.stringify(
        {
          table,
          since: since.toISOString(),
          rowCount: rows.length,
          note:
            "Rows listed only. Wire collection-specific upserts before using in a real rollback window."
        },
        null,
        2
      )
    );
    if (rows.length > 0) {
      console.log(JSON.stringify(rows.slice(0, 5), null, 2));
    }
  } finally {
    await sql.end({ timeout: 5 });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
