#!/usr/bin/env node
/**
 * Destructive demo action: permanently deletes "Untitled document.txt"
 * in this same directory (examples/delete-file-demo/).
 *
 * Intended to be gated by BehalfID via:
 *   behalf run --action delete_files --resource filesystem --risk high -- node examples/delete-file-demo/delete-untitled.mjs
 *
 * Without the CLI gate, this process will delete the file immediately.
 */
import { existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const target = join(dir, "Untitled document.txt");

console.log("Destructive demo: delete Untitled document.txt");
console.log(`Target: ${target}`);

if (!existsSync(target)) {
  console.error(
    'File not found. Seed it first:\n  node examples/delete-file-demo/seed.mjs'
  );
  process.exit(1);
}

unlinkSync(target);
console.log("Deleted Untitled document.txt");
