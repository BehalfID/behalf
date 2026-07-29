#!/usr/bin/env node
/**
 * Manual / end-to-end style validation for scoped activation without requiring
 * real Cursor/Claude/Codex binaries. Exercises the built CLI + resolver APIs.
 *
 * Usage (repo root, after build:cli):
 *   node scripts/dev/validate-scoped-activation.mjs
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolveRoot();
const CLI = join(ROOT, "packages", "cli", "dist", "index.js");
const results = [];

function resolveRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "../..");
}

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function runBehalf(args, opts = {}) {
  const env = {
    ...process.env,
    HOME: opts.home ?? process.env.HOME,
    USERPROFILE: opts.home ?? process.env.USERPROFILE,
    CI: opts.ci ?? process.env.CI,
    ...opts.env,
  };
  // Avoid inheriting an interactive TTY expectation in CI-style checks.
  if (opts.forceNonInteractive) {
    env.CI = "1";
  }
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: opts.cwd ?? ROOT,
    env,
    input: opts.input,
    timeout: opts.timeout ?? 15_000,
  });
}

function gitInit(dir) {
  mkdirSync(dir, { recursive: true });
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8", stdio: "ignore" });
  spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "--allow-empty", "-m", "init"], {
    cwd: dir,
    encoding: "utf8",
    stdio: "ignore",
  });
}

async function main() {
  if (!existsSync(CLI)) {
    console.error("Missing CLI dist. Run: npm run build:cli");
    process.exit(1);
  }

  const base = mkdtempSync(join(tmpdir(), "behalf-scoped-val-"));
  const home = join(base, "home");
  mkdirSync(home, { recursive: true });

  const project = join(base, "root", "project");
  const nested = join(project, "src", "api");
  const projectOld = join(base, "root", "project-old");
  const project2 = join(base, "root", "project2");
  gitInit(project);
  mkdirSync(nested, { recursive: true });
  gitInit(projectOld);
  gitInit(project2);

  // Import protection module with stubbed home via env before dynamic import.
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  const prot = await import(
    pathToFileURL(join(ROOT, "packages/cli/dist/lib/protection/index.js")).href
  );

  // --- Scenario A: repository activation + nested inheritance ---
  prot.upsertRepositoryDecision(prot.canonicalizePath(project), true, "user");
  const nestedRes = prot.resolveActivation({
    cwd: nested,
    interactive: true,
  });
  record(
    "A.repository-inheritance",
    nestedRes.enabled &&
      nestedRes.mode === "repository" &&
      nestedRes.shouldPrompt === false &&
      nestedRes.repositoryRoot === prot.canonicalizePath(project),
    `mode=${nestedRes.mode} root=${nestedRes.repositoryRoot}`
  );

  const statusNested = runBehalf(["protection", "status", "--cwd", nested, "--json"], {
    home,
    cwd: nested,
    forceNonInteractive: true,
  });
  let statusJson = {};
  try {
    statusJson = JSON.parse(statusNested.stdout || "{}");
  } catch {
    statusJson = {};
  }
  record(
    "A.protection-status-nested",
    statusNested.status === 0 && statusJson.enabled === true && statusJson.mode === "repository",
    `exit=${statusNested.status} stdout=${(statusNested.stdout || "").slice(0, 120)}`
  );

  // --- Scenario B: sibling isolation ---
  const sibling = prot.resolveActivation({ cwd: projectOld, interactive: true });
  const sibling2 = prot.resolveActivation({ cwd: project2, interactive: true });
  record(
    "B.sibling-isolation",
    sibling.shouldPrompt === true && sibling2.shouldPrompt === true,
    `old.prompt=${sibling.shouldPrompt} p2.prompt=${sibling2.shouldPrompt}`
  );

  // --- Scenario C: not now does not persist ---
  prot.applyPromptChoice({ mode: "disabled" }, { cwd: project2 });
  const again = prot.resolveActivation({ cwd: project2, interactive: true });
  record(
    "C.not-now-reprompts",
    again.shouldPrompt === true && again.enabled === false,
    `shouldPrompt=${again.shouldPrompt}`
  );

  // --- Scenario D: timed + expiry ---
  const start = new Date("2026-07-01T10:00:00.000Z");
  prot.applyPromptChoice(
    { mode: "timed", duration: "1h" },
    { cwd: project2, now: start }
  );
  const during = prot.resolveActivation({
    cwd: project2,
    interactive: true,
    now: new Date("2026-07-01T10:30:00.000Z"),
  });
  const after = prot.resolveActivation({
    cwd: project2,
    interactive: true,
    now: new Date("2026-07-01T11:30:00.000Z"),
  });
  record(
    "D.timed-active-then-expires",
    during.mode === "timed" &&
      during.enabled === true &&
      after.shouldPrompt === true,
    `during=${during.mode} after.prompt=${after.shouldPrompt}`
  );

  // --- Scenario E: always-on ---
  prot.enableAlways("user");
  const alwaysRes = prot.resolveActivation({
    cwd: projectOld,
    interactive: true,
  });
  record(
    "E.always-on-suppresses-prompt",
    alwaysRes.enabled && alwaysRes.mode === "always" && !alwaysRes.shouldPrompt,
    `mode=${alwaysRes.mode}`
  );

  // --- Scenario F: session env ---
  prot.resetDecisions({ always: true, timed: true, repositories: true });
  const sessionChoice = prot.applyPromptChoice({ mode: "session" }, { cwd: project });
  const env = prot.buildActivationEnv(sessionChoice, {});
  record(
    "F.session-env-set",
    env.BEHALFID_ENABLED === "1" &&
      Boolean(env.BEHALFID_SESSION_ID) &&
      sessionChoice.mode === "session",
    `sid=${env.BEHALFID_SESSION_ID}`
  );
  const withEnv = prot.resolveActivation({
    cwd: nested,
    interactive: true,
    env: { ...env },
  });
  record(
    "F.session-survives-cwd-change",
    withEnv.enabled && withEnv.sessionId === env.BEHALFID_SESSION_ID,
    `mode=${withEnv.mode}`
  );
  const fresh = prot.resolveActivation({ cwd: nested, interactive: true, env: {} });
  record(
    "F.session-does-not-persist",
    fresh.shouldPrompt === true,
    `shouldPrompt=${fresh.shouldPrompt}`
  );

  // --- Scenario G: required cannot be bypassed ---
  prot.upsertRepositoryDecision(prot.canonicalizePath(project), false, "user");
  const required = prot.resolveActivation({
    cwd: project,
    managedPolicyMode: "required",
    flag: "disable",
    interactive: true,
    env: {
      BEHALFID_SESSION_ID: "actsess_spoof",
      BEHALFID_ENABLED: "0",
    },
  });
  record(
    "G.required-not-bypassable",
    required.enabled === true && required.mode === "managed-profile",
    `mode=${required.mode} source=${required.source}`
  );

  // --- Scenario H: noninteractive does not hang ---
  const t0 = Date.now();
  const nonint = runBehalf(["protection", "status", "--json"], {
    home,
    cwd: project,
    forceNonInteractive: true,
    timeout: 10_000,
  });
  const elapsed = Date.now() - t0;
  record(
    "H.noninteractive-status-no-hang",
    nonint.status === 0 && elapsed < 9_000 && nonint.signal == null,
    `exit=${nonint.status} ms=${elapsed}`
  );

  const resolveNonint = prot.resolveActivation({
    cwd: project2,
    interactive: false,
  });
  record(
    "H.noninteractive-default-on",
    resolveNonint.enabled === true &&
      resolveNonint.shouldPrompt === false &&
      resolveNonint.source === "default",
    `mode=${resolveNonint.mode} source=${resolveNonint.source}`
  );

  // --- CLI help consistency ---
  const help = runBehalf(["protection", "--help"], { home, forceNonInteractive: true });
  const helpText = `${help.stdout}\n${help.stderr}`;
  record(
    "docs.help-lists-subcommands",
    /status/.test(helpText) &&
      /enable/.test(helpText) &&
      /disable/.test(helpText) &&
      /reset/.test(helpText) &&
      /list/.test(helpText) &&
      !/remove-repository/.test(helpText),
    "protection --help"
  );

  const enableHelp = runBehalf(["protection", "enable", "--help"], {
    home,
    forceNonInteractive: true,
  });
  const eh = `${enableHelp.stdout}\n${enableHelp.stderr}`;
  record(
    "docs.enable-flags",
    /--session/.test(eh) && /--for/.test(eh) && /--repository/.test(eh) && /--always/.test(eh),
    "enable --help"
  );

  // --- Security: deceptive prefix + bad duration ---
  record(
    "sec.deceptive-prefix",
    !prot.isPathInsideOrEqual(projectOld, project) &&
      !prot.isPathInsideOrEqual(project2, project),
    "project-old / project2"
  );
  let durationRejected = false;
  try {
    prot.parseDuration("-1h");
  } catch {
    durationRejected = true;
  }
  let hugeRejected = false;
  try {
    prot.parseDuration("9999d");
  } catch {
    hugeRejected = true;
  }
  let junkRejected = false;
  try {
    prot.parseDuration("$(reboot)");
  } catch {
    junkRejected = true;
  }
  record(
    "sec.duration-rejects-bad-input",
    durationRejected && hugeRejected && junkRejected,
    `neg=${durationRejected} huge=${hugeRejected} junk=${junkRejected}`
  );

  // Malformed config recovery
  const protDir = join(home, ".behalf");
  mkdirSync(protDir, { recursive: true });
  writeFileSync(join(protDir, "protection.json"), "{not-json", { mode: 0o600 });
  const recovered = prot.readActivationStore();
  const hasBackup = readdirSync(protDir).some((f) =>
    f.startsWith("protection.json.corrupt-")
  );
  record(
    "sec.malformed-config-backup",
    Boolean(recovered.warning) && hasBackup,
    recovered.warning ?? "no warning"
  );

  // Bare ENABLED=0 cannot bypass always-on
  prot.writeActivationStore({
    version: 1,
    alwaysEnabled: true,
    timed: [],
    repositories: [],
  });
  const spoof = prot.resolveActivation({
    cwd: project,
    interactive: false,
    env: { BEHALFID_ENABLED: "0" },
  });
  record(
    "sec.enabled-alone-no-bypass",
    spoof.enabled === true && spoof.mode === "always",
    `mode=${spoof.mode}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(`Summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failures:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }

  // Cleanup temp (best effort)
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
