import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig } from "../lib/config.js";
import {
  type AgentDetail,
  fetchAndCacheDetail,
  readAnyCachedDetail,
} from "../lib/passport-cache.js";
import { getProjectSetupStatus, writeProjectSetup } from "../lib/mcp-setup.js";
import { runAction } from "../lib/output.js";
import {
  parseEgressMode,
  prepareEgressLaunch,
  type EgressMode,
} from "../lib/egressLaunch.js";

type ToolDef = {
  binary: string;
  contextFiles: string[];
  injectLine: string;
};

const TOOLS: Record<string, ToolDef> = {
  claude: {
    binary: "claude",
    contextFiles: ["CLAUDE.md"],
    injectLine: "@.behalf/context.md",
  },
  codex: {
    binary: "codex",
    contextFiles: ["AGENTS.md"],
    injectLine: "@.behalf/context.md",
  },
  cursor: {
    binary: "cursor",
    contextFiles: [".cursorrules"],
    injectLine: "@.behalf/context.md",
  },
};

function redactArg(arg: string): string {
  return arg.replace(/bhf_sk_[A-Za-z0-9._-]+/g, "bhf_sk_[redacted]");
}

// ── BehalfID PreToolUse hook installation (Claude + Codex) ────────────────────

const BEHALF_HOOK_COMMAND = "behalf hook pre-tool-use";

type ClaudeHookSpec = { type?: string; command?: string };
type ClaudeHookMatcher = { matcher?: string; hooks?: ClaudeHookSpec[] };
type HooksFile = Record<string, unknown> & {
  hooks?: Record<string, unknown> & { PreToolUse?: ClaudeHookMatcher[] };
};

export type HookInstallFailureCode =
  | "malformed"
  | "unreadable"
  | "unwritable"
  | "unverified";

export type HookInstallResult =
  | { path: string; ok: true; changed: boolean }
  | { path: string; ok: false; changed: false; code: HookInstallFailureCode };

export type ClaudeHookStatus =
  | { path: string; status: "ok" }
  | { path: string; status: "missing" }
  | { path: string; status: "malformed" }
  | { path: string; status: "unreadable" };

export function claudeSettingsPath(home = homedir()): string {
  return join(home, ".claude", "settings.json");
}

function codexHooksPath(home = homedir()): string {
  return join(home, ".codex", "hooks.json");
}

type ReadHooksOk = { ok: true; settings: HooksFile };
type ReadHooksErr = { ok: false; code: "malformed" | "unreadable" };

/** Read a PreToolUse hooks JSON file. Missing file → empty object. */
function readHooksFile(path: string): ReadHooksOk | ReadHooksErr {
  if (!existsSync(path)) return { ok: true, settings: {} };
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return { ok: false, code: "unreadable" };
  }
  try {
    return { ok: true, settings: JSON.parse(raw) as HooksFile };
  } catch {
    return { ok: false, code: "malformed" };
  }
}

function settingsHaveBehalfHook(settings: HooksFile | null | undefined): boolean {
  const pre = settings?.hooks?.PreToolUse;
  if (!Array.isArray(pre)) return false;
  return pre.some(
    (entry) =>
      Array.isArray(entry?.hooks) &&
      entry.hooks.some((h) => h?.type === "command" && h?.command === BEHALF_HOOK_COMMAND)
  );
}

/**
 * Merge the BehalfID PreToolUse hook into a hooks JSON file, preserving any
 * existing content. Idempotent: re-running never duplicates the entry.
 * Malformed / unreadable / unwritable files are left untouched and reported
 * as a failed install so callers can refuse to launch without enforcement.
 */
function installPreToolUseHookAt(path: string): HookInstallResult {
  const read = readHooksFile(path);
  if (!read.ok) return { path, ok: false, changed: false, code: read.code };

  if (settingsHaveBehalfHook(read.settings)) {
    return { path, ok: true, changed: false };
  }

  const settings = read.settings;
  const hooks = (settings.hooks ?? {}) as Record<string, unknown> & { PreToolUse?: ClaudeHookMatcher[] };
  const preToolUse: ClaudeHookMatcher[] = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  preToolUse.push({
    matcher: ".*",
    hooks: [{ type: "command", command: BEHALF_HOOK_COMMAND }],
  });
  hooks.PreToolUse = preToolUse;
  settings.hooks = hooks;

  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
  } catch {
    return { path, ok: false, changed: false, code: "unwritable" };
  }

  // Confirm the hook is actually present after the write (or would be after merge).
  const verify = readHooksFile(path);
  if (!verify.ok || !settingsHaveBehalfHook(verify.settings)) {
    return { path, ok: false, changed: false, code: "unverified" };
  }

  return { path, ok: true, changed: true };
}

/** Loud, actionable stderr message — never prints file contents or secrets. */
export function formatClaudeHookInstallError(result: Extract<HookInstallResult, { ok: false }>): string {
  const path = result.path;
  switch (result.code) {
    case "malformed":
      return (
        `BehalfID could not install or verify the Claude PreToolUse hook because ${path} is not valid JSON. ` +
        `Claude was not launched. Repair or back up the file, then run \`behalf claude\` again.`
      );
    case "unreadable":
      return (
        `BehalfID could not install or verify the Claude PreToolUse hook because ${path} is unreadable. ` +
        `Claude was not launched. Fix permissions on the file, then run \`behalf claude\` again.`
      );
    case "unwritable":
      return (
        `BehalfID could not install or verify the Claude PreToolUse hook because ${path} is not writable. ` +
        `Claude was not launched. Fix permissions on the file or directory, then run \`behalf claude\` again.`
      );
    case "unverified":
      return (
        `BehalfID could not install or verify the Claude PreToolUse hook in ${path}. ` +
        `Claude was not launched. Repair or back up the file, then run \`behalf claude\` again.`
      );
  }
}

/** Inspect Claude settings without mutating them. */
export function getClaudePreToolUseHookStatus(home = homedir()): ClaudeHookStatus {
  const path = claudeSettingsPath(home);
  const read = readHooksFile(path);
  if (!read.ok) return { path, status: read.code };
  if (settingsHaveBehalfHook(read.settings)) return { path, status: "ok" };
  return { path, status: "missing" };
}

/** True if ~/.claude/settings.json already wires up the BehalfID PreToolUse hook. */
export function hasClaudePreToolUseHook(home = homedir()): boolean {
  return getClaudePreToolUseHookStatus(home).status === "ok";
}

/** Merge the BehalfID PreToolUse hook into ~/.claude/settings.json. */
export function installClaudePreToolUseHook(home = homedir()): HookInstallResult {
  return installPreToolUseHookAt(claudeSettingsPath(home));
}

/** True if ~/.codex/hooks.json already wires up the BehalfID PreToolUse hook. */
export function hasCodexPreToolUseHook(home = homedir()): boolean {
  const read = readHooksFile(codexHooksPath(home));
  return read.ok && settingsHaveBehalfHook(read.settings);
}

/** Merge the BehalfID PreToolUse hook into ~/.codex/hooks.json. */
export function installCodexPreToolUseHook(home = homedir()): HookInstallResult {
  return installPreToolUseHookAt(codexHooksPath(home));
}

// ── Codex MCP server registration (~/.codex/config.toml) ──────────────────────

function codexConfigPath(home = homedir()): string {
  return join(home, ".codex", "config.toml");
}

const CODEX_MCP_BLOCK =
  "[mcp_servers.behalfid]\n" +
  'command = "behalf"\n' +
  'args = ["mcp", "start"]\n';

/**
 * Register the BehalfID MCP server in ~/.codex/config.toml under
 * [mcp_servers.behalfid], preserving any existing config. Idempotent: if the
 * section is already present the file is left untouched; otherwise the block is
 * appended. We append text rather than parse TOML to avoid a dependency and to
 * keep unrelated config byte-for-byte intact.
 */
export function installCodexMcpServer(home = homedir()): { path: string; changed: boolean } {
  const path = codexConfigPath(home);
  let existing = "";
  if (existsSync(path)) {
    existing = readFileSync(path, "utf-8");
    if (/^[ \t]*\[mcp_servers\.behalfid\][ \t]*$/m.test(existing)) {
      return { path, changed: false };
    }
  }

  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let prefix = existing;
  if (prefix.length > 0 && !prefix.endsWith("\n")) prefix += "\n";
  if (prefix.length > 0) prefix += "\n";
  writeFileSync(path, prefix + CODEX_MCP_BLOCK);
  return { path, changed: true };
}

// ── Cursor beforeShellExecution hook installation (~/.cursor/hooks.json) ──────

const CURSOR_HOOK_COMMAND = "behalf hook cursor";

type CursorHookEntry = { command?: string; matcher?: string };
type CursorHooksFile = Record<string, unknown> & {
  version?: number;
  hooks?: Record<string, unknown> & { beforeShellExecution?: CursorHookEntry[] };
};

function cursorHooksPath(home = homedir()): string {
  return join(home, ".cursor", "hooks.json");
}

/** Read ~/.cursor/hooks.json. Returns {} if absent, null if unparseable. */
function readCursorHooks(path: string): CursorHooksFile | null {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CursorHooksFile;
  } catch {
    return null;
  }
}

function cursorHooksHaveBehalf(file: CursorHooksFile | null): boolean {
  const list = file?.hooks?.beforeShellExecution;
  if (!Array.isArray(list)) return false;
  return list.some((e) => e?.command === CURSOR_HOOK_COMMAND);
}

/** True if ~/.cursor/hooks.json already wires up the BehalfID beforeShellExecution hook. */
export function hasCursorBeforeShellHook(home = homedir()): boolean {
  return cursorHooksHaveBehalf(readCursorHooks(cursorHooksPath(home)));
}

/**
 * Merge the BehalfID beforeShellExecution hook into ~/.cursor/hooks.json,
 * preserving any existing content. Cursor uses its own schema (a top-level
 * `version` and `{ command, matcher }` entries), distinct from the Claude/Codex
 * PreToolUse layout. Idempotent, and leaves an unparseable file untouched.
 */
export function installCursorBeforeShellHook(home = homedir()): { path: string; changed: boolean } {
  const path = cursorHooksPath(home);
  const file = readCursorHooks(path);
  if (file === null) return { path, changed: false };
  if (cursorHooksHaveBehalf(file)) return { path, changed: false };

  if (typeof file.version !== "number") file.version = 1;
  const hooks = (file.hooks ?? {}) as Record<string, unknown> & { beforeShellExecution?: CursorHookEntry[] };
  const list: CursorHookEntry[] = Array.isArray(hooks.beforeShellExecution) ? hooks.beforeShellExecution : [];
  list.push({ command: CURSOR_HOOK_COMMAND, matcher: ".*" });
  hooks.beforeShellExecution = list;
  file.hooks = hooks;

  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n");
  return { path, changed: true };
}

type LaunchDeps = {
  spawn?: typeof spawnSync;
  /** Async spawn used to kick off the detached background permission refresh. */
  spawnDetached?: typeof spawn;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

/**
 * How long to wait for a cold-start permission fetch (no cache at all) before
 * giving up and launching anyway. Keeps the worst case bounded instead of the
 * previous unbounded 6-8s wait.
 */
const COLD_FETCH_TIMEOUT_MS = 2000;

/**
 * Kick off a permission refresh that outlives this process. We cannot use a
 * plain background Promise here: the tool is launched with a blocking
 * spawnSync, which freezes the event loop for the entire session, and the
 * subsequent process.exit() would kill any pending fetch. Instead we spawn a
 * detached, unref'd child running the CLI's hidden refresh command so the cache
 * is updated for the next launch. Best-effort: failures are swallowed.
 */
export function refreshPermissionsInBackground(agentId: string, deps: LaunchDeps = {}): void {
  try {
    const spawnAsync = deps.spawnDetached ?? spawn;
    const entry = fileURLToPath(new URL("../index.js", import.meta.url));
    const child = spawnAsync(
      process.execPath,
      [entry, "__refresh-permissions", agentId],
      { detached: true, stdio: "ignore" }
    );
    child.unref();
  } catch {
    // Background refresh is best-effort; never let it break the launch.
  }
}

export async function launchTool(
  toolKey: string,
  extraArgs: string[],
  deps: LaunchDeps = {},
  launchOpts: { egress?: EgressMode } = {}
): Promise<number> {
  const tool = TOOLS[toolKey];
  if (!tool) throw new Error(`Unknown tool "${toolKey}". Supported: ${Object.keys(TOOLS).join(", ")}`);

  const config = readConfig();
  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  const apiKey = resolveApiKey();
  const baseUrl = resolveBaseUrl();
  const stderr = deps.stderr ?? process.stderr;
  const stdout = deps.stdout ?? process.stdout;
  const spawnFn = deps.spawn ?? spawnSync;
  const egressMode = launchOpts.egress ?? parseEgressMode(process.env.BEHALFID_EGRESS_MODE);

  if (!agentId) {
    throw new Error(
      "Agent ID not configured.\nRun: behalf config set agent-id <agentId>"
    );
  }
  if (!apiKey) {
    throw new Error(
      "API key not configured. MCP startup requires an agent API key.\nRun: behalf config set api-key <bhf_sk_xxx>"
    );
  }

  const cwd = process.cwd();
  const status = getProjectSetupStatus(cwd);

  // Resolve permissions. Fast path: any cached detail (even stale) lets us
  // launch immediately; a stale cache triggers a detached background refresh so
  // the next launch is current. Cold path: no cache at all — fetch with a short
  // timeout so a slow/unreachable API can't stall the launch indefinitely.
  let detail: AgentDetail;
  const cached = readAnyCachedDetail(agentId);
  if (cached) {
    detail = cached.data;
    if (!cached.fresh) {
      stderr.write("Using cached BehalfID permissions; refreshing in background.\n");
      refreshPermissionsInBackground(agentId, deps);
    }
  } else {
    stderr.write("Fetching BehalfID permissions... ");
    try {
      detail = await fetchAndCacheDetail(agentId, baseUrl, false, apiKey, COLD_FETCH_TIMEOUT_MS);
      stderr.write("done.\n");
    } catch (err) {
      // No cache and the fetch failed/timed out: proceed anyway. The PreToolUse
      // hook still verifies every tool call live, so launching with an empty
      // permission context is safe; the context file is just less populated.
      stderr.write(
        `failed (${err instanceof Error ? err.message : String(err)}). ` +
        `Launching with empty permissions; refreshing in background.\n`
      );
      detail = { agent: { agentId, name: agentId, status: "unknown" }, permissions: [] };
      refreshPermissionsInBackground(agentId, deps);
    }
  }

  const setup = writeProjectSetup(detail, { cwd });

  // Inject include into tool config files (idempotent)
  for (const fileName of tool.contextFiles) {
    const filePath = join(cwd, fileName);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf-8");
    if (!content.includes(tool.injectLine)) {
      writeFileSync(filePath, content + `\n\n${tool.injectLine}\n`);
    }
  }

  if (!status.contextExists || !status.hasBehalfServer) {
    stderr.write("Initialized BehalfID MCP project setup for this directory.\n");
  }

  // Install the hard PreToolUse gate so every tool call is verified with
  // BehalfID before it runs. Claude and Codex each use their own config layout.
  // For Claude: refuse to launch if the hook cannot be installed or verified.
  if (toolKey === "claude") {
    const hook = installClaudePreToolUseHook();
    if (!hook.ok) {
      stderr.write(formatClaudeHookInstallError(hook) + "\n");
      return 1;
    }
    if (hook.changed) {
      stderr.write(`Installed BehalfID PreToolUse hook → ${hook.path}\n`);
    }
  } else if (toolKey === "codex") {
    const hook = installCodexPreToolUseHook();
    if (hook.ok && hook.changed) {
      stderr.write(`Installed BehalfID PreToolUse hook → ${hook.path}\n`);
    }
    const mcp = installCodexMcpServer();
    if (mcp.changed) {
      stderr.write(`Configured BehalfID MCP server → ${mcp.path}\n`);
    }
  } else if (toolKey === "cursor") {
    // Cursor already wires up the BehalfID MCP server via ~/.cursor/mcp.json, so
    // we only install the beforeShellExecution gate here.
    const hook = installCursorBeforeShellHook();
    if (hook.changed) {
      stderr.write(`Installed BehalfID beforeShellExecution hook → ${hook.path}\n`);
    }
  }

  let childEnv = process.env;
  let stopEgress: (() => Promise<void>) | undefined;
  if (egressMode !== "off") {
    try {
      const prepared = await prepareEgressLaunch({
        mode: egressMode,
        baseUrl,
        apiKey,
        agentId
      });
      childEnv = prepared.env;
      stopEgress = prepared.stop;
      stderr.write(`Egress proxy (${egressMode}) → ${prepared.env.HTTPS_PROXY ?? "n/a"}\n`);
    } catch (err) {
      if (egressMode === "enforce") {
        stderr.write(
          `Failed to start egress proxy: ${err instanceof Error ? err.message : String(err)}\n`
        );
        return 1;
      }
      stderr.write(
        `Egress proxy unavailable (${err instanceof Error ? err.message : String(err)}); continuing without proxy.\n`
      );
    }
  }

  stdout.write(
    `Launching ${tool.binary} with BehalfID enforcement.\n` +
    `Agent: ${agentId}\n` +
    `Base URL: ${baseUrl}\n` +
    `Context: ${setup.contextFile}\n` +
    `MCP config: ${setup.mcpJsonFile}\n` +
    `Command: ${tool.binary}${extraArgs.length ? ` ${extraArgs.map(redactArg).join(" ")}` : ""}\n`
  );

  try {
    const result: SpawnSyncReturns<Buffer> = spawnFn(tool.binary, extraArgs, {
      stdio: "inherit",
      env: childEnv
    });
    return result.status ?? 1;
  } finally {
    if (stopEgress) await stopEgress().catch(() => undefined);
  }
}

function toolCommand(toolKey: string, description: string) {
  return new Command(toolKey)
    .description(description)
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .option("--egress <mode>", "egress interception: off|advise|enforce (default: off)")
    .argument("[args...]", `arguments to pass to ${toolKey}`)
    .action(
      runAction(async (args: string[], opts: { egress?: string }) => {
        process.exit(await launchTool(toolKey, args, {}, { egress: parseEgressMode(opts.egress) }));
      })
    );
}

// ── Command gating ────────────────────────────────────────────────────────────

type ShadowDecision = {
  allowed: boolean;
  reason: string;
  risk: string;
};

type VerifyResult = {
  requestId: string;
  allowed: boolean;
  approvalRequired?: boolean;
  approvalId?: string;
  reason: string;
  risk: string;
  shadow?: boolean;
  shadowDecision?: ShadowDecision;
};

export type CommandMeta = {
  action: string;
  resource: string;
  risk: "low" | "medium" | "high";
};

/**
 * Infer action/resource/risk from a command argv array.
 * Checks are ordered from most-specific to least-specific.
 */
export function inferCommandMeta(argv: string[]): CommandMeta {
  const cmd = argv.join(" ");

  // vercel deploy --prod
  if (/\bvercel\b/.test(cmd) && /--prod\b/.test(cmd))
    return { action: "deploy_production", resource: "vercel", risk: "high" };

  // npm run deploy / npm run deploy:prod / npm run deploy:staging
  if (/\bnpm\b/.test(cmd) && /\bdeploy\b/.test(cmd))
    return { action: "deploy_production", resource: "deployment", risk: "high" };

  // prisma migrate deploy
  if (/\bprisma\b/.test(cmd) && /\bmigrate\b/.test(cmd) && /\bdeploy\b/.test(cmd))
    return { action: "database_migration", resource: "database", risk: "high" };

  // rm -r / rm -rf / rm -Rf
  if (/\brm\b/.test(cmd) && /-[a-zA-Z]*r[a-zA-Z]*/.test(cmd))
    return { action: "delete_files", resource: "filesystem", risk: "high" };

  return { action: "run_command", resource: "shell", risk: "medium" };
}

export type GateExecDeps = {
  spawn?: typeof spawnSync;
  stderr?: Pick<NodeJS.WriteStream, "write">;
};

type GateOpts = {
  action?: string;
  resource?: string;
  risk?: string;
  vendor?: string;
  amount?: string;
  shadow?: boolean;
  egress?: string;
};

/**
 * Verify an action with BehalfID, then execute the command if allowed.
 * Fails closed on verification errors. Returns an exit code.
 */
export async function gateAndExec(
  argv: string[],
  opts: GateOpts = {},
  deps: GateExecDeps = {}
): Promise<number> {
  const config = readConfig();
  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  const apiKey = resolveApiKey();
  const baseUrl = resolveBaseUrl();
  const stderr = deps.stderr ?? process.stderr;
  const spawnFn = deps.spawn ?? spawnSync;
  const egressMode = parseEgressMode(opts.egress ?? process.env.BEHALFID_EGRESS_MODE);

  if (!agentId)
    throw new Error("Agent ID not configured. Run: behalf config set agent-id <agentId>");
  if (!apiKey)
    throw new Error("API key not configured. Run: behalf config set api-key <bhf_sk_xxx>");

  const meta = inferCommandMeta(argv);
  const action = opts.action ?? meta.action;
  const vendor = opts.vendor ?? opts.resource;
  const displayResource = vendor ?? meta.resource;
  const risk = opts.risk ?? meta.risk;
  const shadow = opts.shadow === true || process.env.BEHALFID_SHADOW === "true";

  if (shadow) {
    stderr.write(`[shadow] Evaluating: ${action} on ${displayResource} (risk: ${risk}) — not enforcing...\n`);
  } else {
    stderr.write(`Verifying: ${action} on ${displayResource} (risk: ${risk})...\n`);
  }

  let result: VerifyResult;
  try {
    const body: Record<string, unknown> = { agentId, action };
    if (vendor) body.vendor = vendor;
    if (opts.amount) body.amount = Number(opts.amount);
    if (shadow) body.shadow = true;
    result = await apiRequest<VerifyResult>("/api/verify", { method: "POST", body, apiKey, baseUrl });
  } catch (err) {
    if (shadow) {
      stderr.write(`[shadow] BehalfID evaluation failed — proceeding anyway: ${err instanceof Error ? err.message : String(err)}\n`);
      const [bin, ...binArgs] = argv;
      const child: SpawnSyncReturns<Buffer> = spawnFn(bin, binArgs, { stdio: "inherit" });
      return child.status ?? 1;
    }
    stderr.write(`BehalfID verification failed: ${err instanceof Error ? err.message : String(err)}\n`);
    stderr.write("Fail closed — command not executed.\n");
    return 1;
  }

  // Shadow mode: print what would have happened, then execute regardless
  if (result.shadow) {
    const sd = result.shadowDecision;
    if (sd && !sd.allowed) {
      stderr.write(`\n[shadow] WOULD HAVE BLOCKED\n`);
      stderr.write(`  Request ID: ${result.requestId}\n`);
      stderr.write(`  Action:     ${action}\n`);
      stderr.write(`  Resource:   ${displayResource}\n`);
      stderr.write(`  Reason:     ${sd.reason}\n`);
      stderr.write(`  Risk:       ${sd.risk}\n`);
      stderr.write(`\n[shadow] Executing anyway (shadow mode does not enforce): ${argv.join(" ")}\n\n`);
    } else {
      stderr.write(`[shadow] Would have been allowed — executing: ${argv.join(" ")}\n`);
    }
    const [bin, ...binArgs] = argv;
    const child: SpawnSyncReturns<Buffer> = spawnFn(bin, binArgs, { stdio: "inherit" });
    return child.status ?? 1;
  }

  if (result.approvalRequired) {
    stderr.write(`\n⏳ APPROVAL REQUIRED\n`);
    stderr.write(`  Request ID:  ${result.requestId}\n`);
    if (result.approvalId) stderr.write(`  Approval ID: ${result.approvalId}\n`);
    stderr.write(`  Reason:      ${result.reason}\n`);
    stderr.write(`  Risk:        ${result.risk}\n`);
    stderr.write(`\n  Approve at: ${baseUrl}/dashboard/approvals\n`);
    stderr.write(`\nCommand not executed. Approve the request and re-run.\n\n`);
    return 1;
  }

  if (!result.allowed) {
    stderr.write(`\n✗ BLOCKED ACTION\n`);
    stderr.write(`  Request ID: ${result.requestId}\n`);
    stderr.write(`  Action:     ${action}\n`);
    stderr.write(`  Resource:   ${displayResource}\n`);
    stderr.write(`  Reason:     ${result.reason}\n`);
    stderr.write(`  Risk:       ${result.risk}\n\n`);
    return 1;
  }

  stderr.write(`✓ Allowed — executing: ${argv.join(" ")}\n`);

  let childEnv = process.env;
  let stopEgress: (() => Promise<void>) | undefined;
  if (egressMode !== "off") {
    try {
      const prepared = await prepareEgressLaunch({
        mode: egressMode,
        baseUrl,
        apiKey,
        agentId
      });
      childEnv = prepared.env;
      stopEgress = prepared.stop;
      stderr.write(`Egress proxy (${egressMode}) → ${prepared.env.HTTPS_PROXY ?? "n/a"}\n`);
    } catch (err) {
      if (egressMode === "enforce") {
        stderr.write(
          `Failed to start egress proxy: ${err instanceof Error ? err.message : String(err)}\n`
        );
        return 1;
      }
      stderr.write(
        `Egress proxy unavailable (${err instanceof Error ? err.message : String(err)}); continuing without proxy.\n`
      );
    }
  }

  try {
    const [bin, ...binArgs] = argv;
    const child: SpawnSyncReturns<Buffer> = spawnFn(bin, binArgs, {
      stdio: "inherit",
      env: childEnv
    });
    return child.status ?? 1;
  } finally {
    if (stopEgress) await stopEgress().catch(() => undefined);
  }
}

// ── CLI command definitions ───────────────────────────────────────────────────

export function runCommand() {
  return new Command("run")
    .description(
      "launch an AI tool with BehalfID enforcement (claude|codex|cursor), " +
      "or gate an arbitrary shell command via BehalfID verify before execution.\n\n" +
      "  behalf run claude                      — launch Claude Code with MCP enforcement\n" +
      "  behalf run --egress=enforce -- npm ... — verify + local egress proxy\n" +
      "  behalf run -- npm run deploy:prod      — verify then execute\n" +
      "  behalf run -- vercel deploy --prod     — verify then execute\n" +
      "  behalf run -- prisma migrate deploy    — verify then execute"
    )
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .argument(
      "<tool>",
      `AI tool to launch (${Object.keys(TOOLS).join(", ")}), or first token of the gated command after --`
    )
    .argument("[args...]", "arguments to pass through")
    .option("--action <action>", "override inferred action for command gating")
    .option("--resource <resource>", "override inferred resource/vendor for command gating")
    .option("--risk <risk>", "override inferred risk level: low, medium, high")
    .option("--vendor <vendor>", "alias for --resource")
    .option("--amount <n>", "transaction amount (for purchase actions)")
    .option("--shadow", "shadow mode: evaluate policy and log the decision but do not block execution")
    .option("--egress <mode>", "egress interception: off|advise|enforce (default: off)")
    .action(
      runAction(async (toolKey: string, args: string[], opts: GateOpts) => {
        if (toolKey in TOOLS) {
          process.exit(await launchTool(toolKey, args, {}, { egress: parseEgressMode(opts.egress) }));
        } else {
          process.exit(await gateAndExec([toolKey, ...args], opts));
        }
      })
    );
}

export function claudeCommand() { return toolCommand("claude", "launch Claude Code with BehalfID enforcement"); }
export function codexCommand()  { return toolCommand("codex",  "launch Codex CLI with BehalfID enforcement"); }
export function cursorCommand() { return toolCommand("cursor", "launch Cursor with BehalfID enforcement"); }

/**
 * Hidden command used by the detached background refresh in launchTool. Forces
 * a fresh fetch of the agent's permissions and rewrites the cache, then exits.
 * Best-effort: never throws so the detached process exits cleanly.
 */
export function internalRefreshPermissionsCommand() {
  return new Command("__refresh-permissions")
    .description("internal: refresh the cached permissions for an agent")
    .argument("<agentId>", "agent ID")
    .action(
      runAction(async (agentId: string) => {
        const apiKey = resolveApiKey();
        if (!apiKey) return;
        const baseUrl = resolveBaseUrl();
        await fetchAndCacheDetail(agentId, baseUrl, true, apiKey).catch(() => {});
      })
    );
}
