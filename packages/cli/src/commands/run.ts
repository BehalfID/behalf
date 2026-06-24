import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig } from "../lib/config.js";
import { fetchAndCacheDetail, readCachedDetail } from "../lib/passport-cache.js";
import { getProjectSetupStatus, writeProjectSetup } from "../lib/mcp-setup.js";
import { runAction } from "../lib/output.js";

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

// ── Claude Code PreToolUse hook installation ──────────────────────────────────

const CLAUDE_HOOK_COMMAND = "behalf hook pre-tool-use";

type ClaudeHookSpec = { type?: string; command?: string };
type ClaudeHookMatcher = { matcher?: string; hooks?: ClaudeHookSpec[] };
type ClaudeSettings = Record<string, unknown> & {
  hooks?: Record<string, unknown> & { PreToolUse?: ClaudeHookMatcher[] };
};

function claudeSettingsPath(home = homedir()): string {
  return join(home, ".claude", "settings.json");
}

/** Read ~/.claude/settings.json. Returns {} if absent, null if unparseable. */
function readClaudeSettings(path: string): ClaudeSettings | null {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ClaudeSettings;
  } catch {
    return null;
  }
}

function settingsHaveBehalfHook(settings: ClaudeSettings | null): boolean {
  const pre = settings?.hooks?.PreToolUse;
  if (!Array.isArray(pre)) return false;
  return pre.some(
    (entry) =>
      Array.isArray(entry?.hooks) &&
      entry.hooks.some((h) => h?.type === "command" && h?.command === CLAUDE_HOOK_COMMAND)
  );
}

/** True if ~/.claude/settings.json already wires up the BehalfID PreToolUse hook. */
export function hasClaudePreToolUseHook(home = homedir()): boolean {
  return settingsHaveBehalfHook(readClaudeSettings(claudeSettingsPath(home)));
}

/**
 * Merge the BehalfID PreToolUse hook into ~/.claude/settings.json, preserving
 * any existing content. Idempotent: re-running never duplicates the entry, and
 * an unparseable settings file is left untouched rather than clobbered.
 */
export function installClaudePreToolUseHook(home = homedir()): { path: string; changed: boolean } {
  const path = claudeSettingsPath(home);
  const settings = readClaudeSettings(path);
  if (settings === null) return { path, changed: false };
  if (settingsHaveBehalfHook(settings)) return { path, changed: false };

  const hooks = (settings.hooks ?? {}) as Record<string, unknown> & { PreToolUse?: ClaudeHookMatcher[] };
  const preToolUse: ClaudeHookMatcher[] = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  preToolUse.push({
    matcher: ".*",
    hooks: [{ type: "command", command: CLAUDE_HOOK_COMMAND }],
  });
  hooks.PreToolUse = preToolUse;
  settings.hooks = hooks;

  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
  return { path, changed: true };
}

type LaunchDeps = {
  spawn?: typeof spawnSync;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

export async function launchTool(toolKey: string, extraArgs: string[], deps: LaunchDeps = {}): Promise<number> {
  const tool = TOOLS[toolKey];
  if (!tool) throw new Error(`Unknown tool "${toolKey}". Supported: ${Object.keys(TOOLS).join(", ")}`);

  const config = readConfig();
  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  const apiKey = resolveApiKey();
  const baseUrl = resolveBaseUrl();
  const stderr = deps.stderr ?? process.stderr;
  const stdout = deps.stdout ?? process.stdout;
  const spawn = deps.spawn ?? spawnSync;

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

  // Fetch or refresh permissions
  let detail = readCachedDetail(agentId);
  if (!detail) {
    stderr.write("Fetching BehalfID permissions... ");
    detail = await fetchAndCacheDetail(agentId, baseUrl, false, apiKey);
    stderr.write("done.\n");
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

  // Claude Code: install the hard PreToolUse gate so every tool call is
  // verified with BehalfID before it runs.
  if (toolKey === "claude") {
    const hook = installClaudePreToolUseHook();
    if (hook.changed) {
      stderr.write(`Installed BehalfID PreToolUse hook → ${hook.path}\n`);
    }
  }

  stdout.write(
    `Launching ${tool.binary} with BehalfID MCP enforcement.\n` +
    `Agent: ${agentId}\n` +
    `Base URL: ${baseUrl}\n` +
    `Context: ${setup.contextFile}\n` +
    `MCP config: ${setup.mcpJsonFile}\n` +
    `Command: ${tool.binary}${extraArgs.length ? ` ${extraArgs.map(redactArg).join(" ")}` : ""}\n`
  );

  // Launch the tool
  const result: SpawnSyncReturns<Buffer> = spawn(tool.binary, extraArgs, { stdio: "inherit" });
  return result.status ?? 1;
}

function toolCommand(toolKey: string, description: string) {
  return new Command(toolKey)
    .description(description)
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .argument("[args...]", `arguments to pass to ${toolKey}`)
    .action(
      runAction(async (args: string[]) => {
        process.exit(await launchTool(toolKey, args));
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
  const [bin, ...binArgs] = argv;
  const child: SpawnSyncReturns<Buffer> = spawnFn(bin, binArgs, { stdio: "inherit" });
  return child.status ?? 1;
}

// ── CLI command definitions ───────────────────────────────────────────────────

export function runCommand() {
  return new Command("run")
    .description(
      "launch an AI tool with BehalfID enforcement (claude|codex|cursor), " +
      "or gate an arbitrary shell command via BehalfID verify before execution.\n\n" +
      "  behalf run claude                      — launch Claude Code with MCP enforcement\n" +
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
    .action(
      runAction(async (toolKey: string, args: string[], opts: GateOpts) => {
        if (toolKey in TOOLS) {
          process.exit(await launchTool(toolKey, args));
        } else {
          process.exit(await gateAndExec([toolKey, ...args], opts));
        }
      })
    );
}

export function claudeCommand() { return toolCommand("claude", "launch Claude Code with BehalfID enforcement"); }
export function codexCommand()  { return toolCommand("codex",  "launch Codex CLI with BehalfID enforcement"); }
