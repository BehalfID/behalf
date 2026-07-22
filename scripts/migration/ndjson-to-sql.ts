import fs from "node:fs";
import path from "node:path";

const dir = "migration-data";
const outDir = "migration-sql";
fs.mkdirSync(outDir, { recursive: true });

function esc(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ndjson"));
let total = 0;

for (const file of files) {
  const table = file.replace(/\.ndjson$/, "");
  const lines = fs
    .readFileSync(path.join(dir, file), "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length === 0) {
    fs.writeFileSync(path.join(outDir, `${table}.sql`), "-- empty\n");
    console.log(`${table}: 0`);
    continue;
  }

  const rows = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  const cols = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  const values = rows
    .map((row) => `(${cols.map((col) => esc(row[col])).join(",")})`)
    .join(",\n");
  const sql =
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES\n` +
    `${values}\nON CONFLICT DO NOTHING;\n`;
  fs.writeFileSync(path.join(outDir, `${table}.sql`), sql);
  total += rows.length;
  console.log(`${table}: ${rows.length} (${sql.length} chars)`);
}

console.log(`total rows: ${total}`);
