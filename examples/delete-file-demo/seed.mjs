#!/usr/bin/env node
/**
 * Recreate the disposable demo target file.
 * Run this between demos after a successful delete.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const target = join(dir, "Untitled document.txt");

const contents = `# Demo target for BehalfID delete_files gating.

This file is intentionally disposable. The demo script deletes it.
Restore with:

  node examples/delete-file-demo/seed.mjs

or:

  git checkout -- "examples/delete-file-demo/Untitled document.txt"
`;

writeFileSync(target, contents, "utf8");
console.log(`Seeded: ${target}`);
