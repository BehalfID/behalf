/**
 * Minimal .env loader for live integration tests.
 *
 * Reads ~/behalf/.env, parses KEY=value lines, and populates process.env.
 * Does NOT overwrite variables already set in the environment.
 * Does NOT log values.
 * Does NOT require dotenv.
 *
 * Inline comments (KEY=value # comment) are stripped.
 * Quoted values (KEY="value" or KEY='value') are unquoted.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

export function loadLocalEnv(
  envPath: string = resolve(homedir(), "behalf", ".env")
): void {
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    if (!key) continue;

    let value = trimmed.slice(eqIdx + 1).trim();

    // strip inline comment
    const commentIdx = value.search(/\s+#/);
    if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();

    // unquote
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
