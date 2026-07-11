/**
 * Local helper for Trajectus pilot rehearsal prep.
 *
 * Safe scope only:
 *   --check    Print environment prerequisite hints (CLI on PATH, optional doctor).
 *   --sandbox  Create pilot-sandbox/ under the current directory (disposable repo).
 *   --collect  Extract requestId / approvalId-looking tokens from a text capture file.
 *
 * Does not approve actions, write to Mongo, seed permissions, or read/write secrets stores.
 *
 * Usage:
 *   npx tsx scripts/pilot-rehearsal-prep.ts --check
 *   npx tsx scripts/pilot-rehearsal-prep.ts --sandbox
 *   npx tsx scripts/pilot-rehearsal-prep.ts --collect path/to/capture.txt
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const SANDBOX_DIR = "pilot-sandbox";
const README_NAME = "README.txt";

function printHelp(): void {
  console.log(`pilot-rehearsal-prep — local rehearsal helper (no approvals, no DB writes)

Usage:
  npx tsx scripts/pilot-rehearsal-prep.ts --check
  npx tsx scripts/pilot-rehearsal-prep.ts --sandbox
  npx tsx scripts/pilot-rehearsal-prep.ts --collect path/to/capture.txt

See docs/PILOT_REHEARSAL.md.`);
}

function runCheck(): number {
  console.log("Pilot rehearsal prerequisite check (local only)\n");

  const which = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(which, ["behalf"], { encoding: "utf8" });
  if (found.status === 0 && found.stdout.trim()) {
    console.log(`OK  behalf on PATH:\n    ${found.stdout.trim().split(/\r?\n/)[0]}`);
  } else {
    console.log("MISS behalf not on PATH — install via docs/PILOT_TESTER_GUIDE.md");
  }

  const version = spawnSync("behalf", ["--version"], { encoding: "utf8" });
  if (version.status === 0) {
    console.log(`OK  behalf --version → ${version.stdout.trim() || version.stderr.trim()}`);
  } else {
    console.log("MISS could not run behalf --version");
  }

  const doctor = spawnSync("behalf", ["doctor"], { encoding: "utf8" });
  if (doctor.status === 0) {
    console.log("OK  behalf doctor exited 0");
    const out = `${doctor.stdout}\n${doctor.stderr}`.trim();
    if (out) {
      const lines = out.split(/\r?\n/).slice(0, 40);
      console.log("---- doctor (first 40 lines, review for secrets before sharing) ----");
      for (const line of lines) console.log(line);
      console.log("---- end doctor excerpt ----");
    }
  } else if (found.status === 0) {
    console.log("WARN behalf doctor failed or is unavailable — run it manually after auth");
  }

  console.log(`
Reminders:
  - Engineer and approver must be separate workspace users / browser profiles.
  - Do not share agent API keys.
  - Confirm the deployed commit includes PR #111 approval-grant integrity before
    running substitution scenarios (see docs/PILOT_REHEARSAL.md).
  - This script does not configure permissions or approve requests.`);
  return 0;
}

function runSandbox(): number {
  const root = resolve(process.cwd(), SANDBOX_DIR);
  mkdirSync(root, { recursive: true });
  const readme = join(root, README_NAME);
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      [
        "Trajectus pilot sandbox",
        "",
        "Safe directory for write_file approval rehearsals.",
        "Do not place real secrets, SSH keys, or production .env files here.",
        "",
      ].join("\n"),
      "utf8"
    );
  }
  console.log(`Created/confirmed sandbox: ${root}`);
  console.log(`Use allowedPaths: ${SANDBOX_DIR}/**`);
  return 0;
}

function collectIds(source: string): number {
  if (!source) {
    console.error("Usage: --collect path/to/capture.txt");
    return 1;
  }
  const path = resolve(source);
  if (!existsSync(path)) {
    console.error(`File not found: ${path}`);
    return 1;
  }
  const text = readFileSync(path, "utf8");

  const requestIds = [...text.matchAll(/\breq_[A-Za-z0-9]+\b/g)].map((m) => m[0]);
  const approvalIds = [...text.matchAll(/\bapr_[A-Za-z0-9]+\b/g)].map((m) => m[0]);

  const uniq = (xs: string[]) => [...new Set(xs)];
  const reqs = uniq(requestIds);
  const aprs = uniq(approvalIds);

  console.log(`requestIds (${reqs.length}):`);
  for (const id of reqs) console.log(`  ${id}`);
  console.log(`approvalIds (${aprs.length}):`);
  for (const id of aprs) console.log(`  ${id}`);

  if (reqs.length === 0 && aprs.length === 0) {
    console.log("(none found)");
  }
  return 0;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }

  if (args.includes("--check")) {
    process.exit(runCheck());
  }
  if (args.includes("--sandbox")) {
    process.exit(runSandbox());
  }
  const collectIdx = args.indexOf("--collect");
  if (collectIdx !== -1) {
    const file = args[collectIdx + 1] ?? "-";
    process.exit(collectIds(file));
  }

  console.error(`Unknown arguments: ${args.join(" ")}`);
  printHelp();
  process.exit(1);
}

main();
