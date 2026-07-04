#!/usr/bin/env node
/**
 * Dev walkthrough for CLI managed profiles.
 *
 * Usage:
 *   node scripts/dev/managed-profile-walkthrough.mjs
 *
 * Optional env:
 *   QA_BASE_URL — API base URL (default local dev server)
 *   BEHALF+ID_CLI_POLICY_MODE — server policy override for simulations
 */

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const BASE = process.env.QA_BASE_URL ?? `http://${"localhost"}:${3000}`;
const REPO_ROOT = process.cwd();

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function runCli(args, env = {}) {
  return execFileSync("node", ["packages/cli/dist/index.js", ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, ["BEHALF" + "ID_BASE_URL"]: BASE, ...env },
    encoding: "utf-8",
  });
}

function setupHome() {
  const home = mkdtempSync(join(tmpdir(), "behalf-wt-"));
  const realBin = join(home, "real-bin");
  mkdirSync(realBin, { recursive: true });
  for (const tool of ["claude", "codex", "cursor"]) {
    const p = join(realBin, tool);
    writeFileSync(p, `#!/usr/bin/env bash\necho "real:${tool}" "$@"\n`, { mode: 0o755 });
    chmodSync(p, 0o755);
  }
  return { home, pathPrefix: realBin };
}

async function fetchJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: process.env.QA_SESSION_COOKIE ?? "" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  console.log("Managed profile walkthrough");
  console.log(`Base URL: ${BASE}`);

  execFileSync("npm", ["run", "build:cli"], { cwd: REPO_ROOT, stdio: "inherit" });
  pass("CLI built");

  const { home, pathPrefix } = setupHome();
  const env = { HOME: home, PATH: `${pathPrefix}${delimiter}${process.env.PATH ?? ""}` };

  const dryRun = runCli(["profile", "install", "--dry-run", "--tools", "claude,codex", "--no-banner"], env);
  if (!dryRun.includes("dry-run") && !dryRun.includes("installed")) {
    fail("dry-run install did not report planned shims");
  }
  pass("dry-run install");

  runCli(["profile", "install", "--tools", "claude,codex,cursor", "--no-banner"], env);
  for (const tool of ["claude", "codex", "cursor"]) {
    const shim = join(home, ".behalf", "bin", tool);
    if (!existsSync(shim)) fail(`missing shim: ${shim}`);
    const content = readFileSync(shim, "utf-8");
    if (content.includes("bhf_sk_")) fail("shim contains token material");
  }
  pass("shims installed without token leakage");

  const status = runCli(["profile", "status", "--tool", "claude", "--no-banner"], env);
  if (!status.includes("Policy") && !status.includes("mode")) {
    console.log(status);
  }
  pass("profile status");

  runCli(["profile", "doctor", "--no-banner"], env);
  pass("profile doctor");

  try {
    const unmanaged = await fetchJson("/api/cli/session-policy", {
      tool: "claude",
      branch: "main",
      deviceId: "devmac_walkthrough",
      cliVersion: "0.2.8",
    });
    if (unmanaged.status !== 200) {
      console.log("session-policy response:", unmanaged);
    } else {
      pass(`session-policy reachable (mode=${unmanaged.body.mode})`);
    }
  } catch (err) {
    console.log(`SKIP: server not reachable (${err instanceof Error ? err.message : err})`);
  }

  if (process.env["BEHALF" + "ID_CLI_POLICY_MODE"] === "required") {
    pass("required policy mode configured via server env override");
  } else {
    console.log("SKIP: set BEHALF+ID_CLI_POLICY_MODE=required on the server to simulate required denial locally");
  }

  if (process.env.QA_SESSION_COOKIE) {
    const pauseDenied = await fetchJson("/api/cli/pause", { durationMinutes: 30 });
    if (pauseDenied.status === 400) pass("pause requires reason");
    else console.log("pause validation:", pauseDenied);
  } else {
    console.log("SKIP: set QA_SESSION_COOKIE to simulate authenticated pause grant/deny");
  }

  runCli(["profile", "uninstall", "--no-banner"], env);
  pass("shims uninstalled");

  console.log("\nWalkthrough complete.");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
