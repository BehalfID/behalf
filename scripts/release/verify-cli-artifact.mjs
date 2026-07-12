#!/usr/bin/env node
/**
 * Verify a packed @behalfid/cli npm tarball before publish.
 * Usage: node scripts/release/verify-cli-artifact.mjs <path-to.tgz> <expectedVersion>
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const tarball = process.argv[2];
const expectedVersion = process.argv[3];

if (!tarball || !expectedVersion) {
  console.error("Usage: node scripts/release/verify-cli-artifact.mjs <tarball.tgz> <expectedVersion>");
  process.exit(2);
}
if (!existsSync(tarball)) {
  console.error(`Tarball not found: ${tarball}`);
  process.exit(1);
}

const sha256 = createHash("sha256").update(readFileSync(tarball)).digest("hex");
console.log(`tarball: ${tarball}`);
console.log(`sha256: ${sha256}`);

const extractDir = mkdtempSync(join(tmpdir(), "behalf-cli-pack-"));
try {
  const extract = spawnSync("tar", ["-xzf", tarball, "-C", extractDir], { encoding: "utf8" });
  if (extract.status !== 0) {
    // Windows fallback via npm pack extract is unavailable; try PowerShell tar / bsdtar.
    console.error(extract.stderr || "tar extract failed");
    process.exit(1);
  }

  const pkgRoot = join(extractDir, "package");
  const pkgJsonPath = join(pkgRoot, "package.json");
  if (!existsSync(pkgJsonPath)) {
    console.error("package/package.json missing from tarball");
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  if (pkg.version !== expectedVersion) {
    console.error(`package version ${pkg.version} !== expected ${expectedVersion}`);
    process.exit(1);
  }
  console.log(`version: ${pkg.version}`);

  const indexJs = join(pkgRoot, "dist", "index.js");
  const hookJs = join(pkgRoot, "dist", "commands", "hook.js");
  if (!existsSync(indexJs)) {
    console.error("dist/index.js missing from tarball");
    process.exit(1);
  }
  if (!existsSync(hookJs)) {
    console.error("dist/commands/hook.js missing from tarball");
    process.exit(1);
  }
  console.log("dist/index.js: present");
  console.log("dist/commands/hook.js: present");

  const hookSrc = readFileSync(hookJs, "utf8");
  const required = ["policyContext", "PowerShell", "Monitor", "NotebookEdit", "Agent"];
  // Monitor mapping is command-gated; require both the tool name and command check.
  for (const token of required) {
    if (!hookSrc.includes(token)) {
      console.error(`dist/commands/hook.js missing required token: ${token}`);
      process.exit(1);
    }
  }
  if (!/Monitor/.test(hookSrc) || !/command/.test(hookSrc)) {
    console.error("dist/commands/hook.js missing Monitor-with-command mapping signals");
    process.exit(1);
  }
  console.log("hook mappings: policyContext, PowerShell, Monitor+command, NotebookEdit, Agent");

  // Reject secrets / unrelated repo files in the packed package.
  const list = spawnSync("tar", ["-tzf", tarball], { encoding: "utf8" });
  if (list.status !== 0) {
    console.error(list.stderr || "tar list failed");
    process.exit(1);
  }
  const entries = list.stdout.split(/\r?\n/).filter(Boolean);
  const blocked = entries.filter((e) => {
    const lower = e.toLowerCase();
    if (lower.includes(".env")) return true;
    if (lower.endsWith("credentials.json")) return true;
    if (lower.includes("node_modules/")) return true;
    if (lower.startsWith("package/") === false) return true;
    // Unrelated monorepo paths should not appear inside the CLI package.
    if (lower.includes("package/app/") || lower.includes("package/docs/")) return true;
    return false;
  });
  if (blocked.length) {
    console.error("tarball contains forbidden paths:");
    for (const b of blocked.slice(0, 20)) console.error(`  ${b}`);
    process.exit(1);
  }
  console.log(`entries: ${entries.length} (no secrets / unrelated paths)`);

  // Install production deps so `node dist/index.js --version` can resolve commander.
  const npmInstall = spawnSync(
    "npm",
    ["install", "--omit=dev", "--ignore-scripts", "--no-package-lock"],
    { cwd: pkgRoot, encoding: "utf8", shell: process.platform === "win32" }
  );
  if (npmInstall.status !== 0) {
    console.error(npmInstall.stderr || npmInstall.stdout || "npm install in packed package failed");
    process.exit(1);
  }

  const ver = spawnSync(process.execPath, [indexJs, "--version"], {
    encoding: "utf8",
    cwd: pkgRoot,
  });
  const reported = (ver.stdout || "").trim();
  if (ver.status !== 0) {
    console.error(ver.stderr || "--version failed");
    process.exit(1);
  }
  if (reported !== expectedVersion) {
    console.error(`node dist/index.js --version reported "${reported}", expected "${expectedVersion}"`);
    process.exit(1);
  }
  console.log(`--version: ${reported}`);
  console.log("verify-cli-artifact: OK");
} finally {
  rmSync(extractDir, { recursive: true, force: true });
}
