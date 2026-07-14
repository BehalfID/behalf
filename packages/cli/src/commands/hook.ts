import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { CONFIG_DIR_PATH, readConfig, readExtendedConfig } from "../lib/config.js";

/**
 * The subset of the Claude Code PreToolUse hook payload we care about. Claude
 * Code pipes this JSON object to the hook command on stdin before every tool
 * call.
 */
type HookInput = {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  /** Defensive fallback: tolerate a camelCase field name from non-standard hosts. */
  toolName?: string;
  /** Validated as an object before any field is read. */
  tool_input?: unknown;
};

type VerifyResult = {
  requestId?: string;
  allowed: boolean;
  approvalRequired?: boolean;
  reason?: string;
  risk?: string;
};

type ActionMap = { action: string; resource: string };

/** Max serialized size for policyContext sent to /api/verify (must match server). */
export const POLICY_CONTEXT_MAX_BYTES = 16 * 1024;

export type ClaudePolicyToolInput = {
  filePath?: string;
  command?: string;
};

export type ClaudePolicyContext = {
  source: "claude_code";
  toolName?: string;
  cwd?: string;
  home?: string;
  toolInput?: ClaudePolicyToolInput;
};

export type AntigravityPolicyContext = {
  source: "antigravity";
  toolName?: string;
  cwd?: string;
  home?: string;
  toolInput?: ClaudePolicyToolInput;
};

/** Union of the per-provider policy contexts sent to /api/verify. */
export type ProviderPolicyContext = ClaudePolicyContext | AntigravityPolicyContext;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Map a Claude Code tool name (and its input) to a BehalfID action + resource.
 *
 *   Write / Edit / MultiEdit / NotebookEdit → write_file on filesystem
 *   Read                                   → read_file  on filesystem
 *   Bash / PowerShell                      → execute_command on shell
 *   Monitor (when tool_input.command set)  → execute_command on shell
 *   WebFetch / WebSearch                   → browse_web on hostname (or "web")
 *   mcp__<server>__<tool>                  → mcp_tool on the MCP server name
 *   Agent / Task                           → spawn_agent on agent
 *
 * Monitor without a shell `command` (e.g. WebSocket-only monitoring) is
 * intentionally unmapped — it has no clean existing action without weakening
 * policy behavior.
 *
 * Matching is tolerant of how the host passes the tool name: leading/trailing
 * whitespace, casing ("write"), and namespace/prefix wrappers ("tool:Write",
 * "anthropic.Write", "core/MultiEdit", "foo__Edit") all resolve to the
 * canonical tool. This matters because an unmapped tool short-circuits the gate
 * *before* /api/verify is ever called, so a mis-cased "Write" would silently
 * skip the audit log entirely.
 *
 * Returns null for tools that have no BehalfID-gated equivalent (Glob, Grep,
 * TodoWrite, …); those are allowed through without a verify round-trip so the
 * agent keeps working.
 */
export function mapToolToAction(
  toolName: string,
  toolInput: Record<string, unknown> = {}
): ActionMap | null {
  if (typeof toolName !== "string") return null;
  const trimmed = toolName.trim();
  if (!trimmed) return null;

  // MCP tools are named mcp__<server>__<tool> (prefix matched case-insensitively).
  if (/^mcp__/i.test(trimmed)) {
    const server = trimmed.split("__")[1] || "mcp";
    return { action: "mcp_tool", resource: server };
  }

  // Strip any namespace/prefix down to the final segment, then lowercase, so
  // format variants resolve instead of falling through to the unmapped path.
  // Full-segment matching avoids false positives (e.g. "NotebookEdit" stays
  // distinct from "edit" and is mapped explicitly below).
  const base = (trimmed.split(/[:/.]|__/).pop() ?? trimmed).toLowerCase();

  switch (base) {
    case "write":
    case "edit":
    case "multiedit":
    case "notebookedit":
      return { action: "write_file", resource: "filesystem" };
    case "read":
      return { action: "read_file", resource: "filesystem" };
    case "bash":
    case "powershell":
      return { action: "execute_command", resource: "shell" };
    case "monitor":
      // Only command-backed Monitor calls map to execute_command. Other Monitor
      // shapes (e.g. WebSocket monitoring) remain unmapped by design.
      if (readNonEmptyString(toolInput.command)) {
        return { action: "execute_command", resource: "shell" };
      }
      return null;
    case "webfetch":
    case "websearch":
      return { action: "browse_web", resource: hostnameFromInput(toolInput) };
    case "agent":
    case "task":
      return { action: "spawn_agent", resource: "agent" };
    default:
      return null;
  }
}

function hostnameFromInput(toolInput: Record<string, unknown>): string {
  const url = typeof toolInput.url === "string" ? toolInput.url : undefined;
  if (url) {
    try {
      return new URL(url).hostname || "web";
    } catch {
      return "web";
    }
  }
  return "web";
}

function extractFilePath(toolInput: Record<string, unknown>): string | undefined {
  return (
    readNonEmptyString(toolInput.file_path) ??
    readNonEmptyString(toolInput.filePath) ??
    readNonEmptyString(toolInput.path) ??
    readNonEmptyString(toolInput.notebook_path) ??
    readNonEmptyString(toolInput.notebookPath)
  );
}

function extractCommand(toolInput: Record<string, unknown>): string | undefined {
  return readNonEmptyString(toolInput.command);
}

function resolveHomeDir(): string | undefined {
  return readNonEmptyString(process.env.HOME) ?? readNonEmptyString(process.env.USERPROFILE);
}

/**
 * Build a sanitized, non-persisted policyContext for /api/verify.
 *
 * Only constraint-relevant fields are retained. Write contents, Edit
 * old_string/new_string, notebook cell bodies, prompts, and other tool_input
 * fields are never forwarded.
 *
 * Returns null when there is nothing useful to send.
 */
export function buildClaudePolicyContext(opts: {
  toolName: string;
  action: string;
  cwd?: string;
  toolInput: Record<string, unknown>;
  home?: string;
}): ClaudePolicyContext | null {
  const toolInput: ClaudePolicyToolInput = {};
  const filePath = extractFilePath(opts.toolInput);
  const command = extractCommand(opts.toolInput);

  if (
    (opts.action === "write_file" || opts.action === "read_file") &&
    filePath
  ) {
    toolInput.filePath = filePath;
  }
  if (opts.action === "execute_command" && command) {
    toolInput.command = command;
  }

  const hasToolInput = toolInput.filePath !== undefined || toolInput.command !== undefined;
  const cwd = readNonEmptyString(opts.cwd);
  const home =
    toolInput.filePath !== undefined
      ? readNonEmptyString(opts.home) ?? resolveHomeDir()
      : undefined;

  if (!hasToolInput && !cwd && !home) {
    return null;
  }

  const ctx: ClaudePolicyContext = {
    source: "claude_code",
    toolName: opts.toolName,
  };
  if (cwd) ctx.cwd = cwd;
  if (home) ctx.home = home;
  if (hasToolInput) ctx.toolInput = toolInput;
  return ctx;
}

/**
 * Returns an error message when the sanitized policy context exceeds the
 * accepted maximum. Callers must fail closed — do not omit the context and
 * proceed as though no constraints existed.
 */
export function policyContextSizeError(policyContext: ProviderPolicyContext): string | null {
  const size = Buffer.byteLength(JSON.stringify(policyContext), "utf8");
  if (size > POLICY_CONTEXT_MAX_BYTES) {
    return `policy context exceeds ${POLICY_CONTEXT_MAX_BYTES} byte limit (${size} bytes)`;
  }
  return null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export type PreToolUseDeps = {
  stdin?: () => Promise<string>;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  verify?: (body: Record<string, unknown>) => Promise<VerifyResult>;
};

/**
 * The PreToolUse gate. Reads a Claude Code tool call from stdin and verifies it
 * with BehalfID. Returns the process exit code:
 *
 *   0 → allow the tool call to proceed
 *   2 → block the tool call (deny or approval-required)
 *
 * Fails OPEN (returns 0 with a warning) on missing config or network/API
 * errors, so a BehalfID outage never bricks the agent.
 *
 * Malformed or oversized local policy input fails CLOSED (exit 2): that is not
 * a network outage, and proceeding without constraint arguments would silently
 * weaken path/command evaluation.
 */
export async function runPreToolUse(deps: PreToolUseDeps = {}): Promise<number> {
  const stderr = deps.stderr ?? process.stderr;
  const readInput = deps.stdin ?? readStdin;
  // Opt-in tracing: `BEHALFID_DEBUG=1 behalf hook pre-tool-use` prints the
  // tool_name actually received and every gate decision to stderr. Off by
  // default so normal runs stay silent. It deliberately does not dump
  // tool_input, which can contain file contents or secrets.
  const debug = process.env.BEHALFID_DEBUG === "1";
  const trace = (msg: string) => {
    if (debug) stderr.write(`BehalfID[debug]: ${msg}\n`);
  };

  let raw = "";
  let input: HookInput;
  try {
    raw = await readInput();
    input = raw.trim() ? (JSON.parse(raw) as HookInput) : {};
  } catch {
    trace(`could not parse ${raw.length} bytes of stdin as JSON`);
    stderr.write("BehalfID: could not parse hook input — allowing (fail open).\n");
    return 0;
  }
  trace(`payload keys: [${Object.keys(input).join(", ")}]`);

  const toolName = input.tool_name ?? input.toolName;
  trace(`received tool_name=${JSON.stringify(toolName)}`);
  if (!toolName) {
    trace("no tool_name in payload — allowing (fail open)");
    return 0;
  }

  const rawToolInput = input.tool_input;
  const toolInput: Record<string, unknown> = isRecord(rawToolInput) ? rawToolInput : {};
  if (rawToolInput !== undefined && !isRecord(rawToolInput)) {
    trace(`tool_input is ${typeof rawToolInput}, not an object — ignoring fields`);
  }

  const mapped = mapToolToAction(toolName, toolInput);
  trace(
    `mapped ${JSON.stringify(toolName)} → ${mapped ? `${mapped.action} on ${mapped.resource}` : "null (no BehalfID-gated equivalent)"}`
  );
  if (!mapped) return 0; // tool has no BehalfID-gated equivalent

  const config = readConfig();
  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  const apiKey = resolveApiKey();
  const baseUrl = resolveBaseUrl();

  if (!agentId || !apiKey) {
    trace(`not configured: agentId=${agentId ? "set" : "missing"} apiKey=${apiKey ? "set" : "missing"}`);
    stderr.write("BehalfID: not configured (agent ID or API key missing) — allowing (fail open).\n");
    return 0;
  }

  const policyContext = buildClaudePolicyContext({
    toolName,
    action: mapped.action,
    cwd: typeof input.cwd === "string" ? input.cwd : undefined,
    toolInput,
  });

  if (policyContext) {
    const sizeErr = policyContextSizeError(policyContext);
    if (sizeErr) {
      trace(`policy context blocked: ${sizeErr}`);
      stderr.write(
        "BehalfID: blocked — policy context too large to evaluate safely.\n"
      );
      return 2;
    }
    if (policyContext.toolInput?.command !== undefined) {
      trace("policy context: command present");
    }
    if (policyContext.toolInput?.filePath !== undefined) {
      trace("policy context: file path present");
    }
    if (policyContext.cwd) {
      trace("policy context: cwd present");
    }
  }

  let result: VerifyResult;
  try {
    const body: Record<string, unknown> = {
      agentId,
      action: mapped.action,
      vendor: mapped.resource,
    };
    if (policyContext) {
      body.policyContext = policyContext;
    }
    // Debug must never print commands, paths, file contents, or credentials.
    trace(
      `POST ${baseUrl}/api/verify action=${mapped.action} vendor=${mapped.resource} policyContext=${policyContext ? "present" : "absent"}`
    );
    result = deps.verify
      ? await deps.verify(body)
      : await apiRequest<VerifyResult>("/api/verify", { method: "POST", body, apiKey, baseUrl });
    trace(
      `verify → allowed=${result.allowed} approvalRequired=${result.approvalRequired ?? false} reason=${JSON.stringify(result.reason)}`
    );
  } catch (err) {
    stderr.write(
      `BehalfID: verification unavailable (${err instanceof Error ? err.message : String(err)}) — allowing (fail open).\n`
    );
    return 0;
  }

  if (result.allowed) return 0;

  const reason = result.reason ?? "Action not permitted.";
  const needsApproval = result.approvalRequired === true || /approval/i.test(reason);
  if (needsApproval) {
    stderr.write("BehalfID: approval required. Visit your Action Inbox to approve.\n");
  } else {
    stderr.write(`BehalfID: blocked — ${reason}\n`);
  }
  // Exit 2 is Claude Code's blocking signal for PreToolUse hooks: stderr is fed
  // back to the agent and the tool call is hard-blocked.
  return 2;
}

export type CursorHookDeps = {
  stdin?: () => Promise<string>;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  verify?: (body: Record<string, unknown>) => Promise<VerifyResult>;
};

/** Cursor's beforeShellExecution payload: we only need the command for tracing. */
type CursorHookInput = { command?: string };

/**
 * The Cursor beforeShellExecution gate. Mirrors runPreToolUse — read a command
 * from stdin and verify it with BehalfID — but speaks Cursor's protocol instead
 * of Claude's. Cursor expects a JSON decision on stdout rather than an exit
 * code:
 *
 *   deny  → print {"permission":"deny","reason":"..."} and exit 0
 *   allow → print nothing and exit 0
 *
 * Shell execution is gated uniformly as execute_command on shell, matching how
 * the Claude/Codex PreToolUse hook gates Bash, so enforcement is consistent
 * across all three tools.
 *
 * Fails OPEN (allow, nothing printed) on missing config or network/API errors,
 * so a BehalfID outage never blocks the developer.
 */
export async function runCursorHook(deps: CursorHookDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const readInput = deps.stdin ?? readStdin;
  const debug = process.env.BEHALFID_DEBUG === "1";
  const trace = (msg: string) => {
    if (debug) stderr.write(`BehalfID[debug]: ${msg}\n`);
  };

  let raw = "";
  let input: CursorHookInput;
  try {
    raw = await readInput();
    input = raw.trim() ? (JSON.parse(raw) as CursorHookInput) : {};
  } catch {
    trace(`could not parse ${raw.length} bytes of stdin as JSON — allowing (fail open)`);
    return 0; // fail open: allow, print nothing
  }
  trace(`payload keys: [${Object.keys(input).join(", ")}]`);
  // Presence only — never echo the raw command (may contain secrets).
  trace(`command=${typeof input.command === "string" && input.command.trim() ? "present" : "absent"}`);

  const config = readConfig();
  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  const apiKey = resolveApiKey();
  const baseUrl = resolveBaseUrl();

  if (!agentId || !apiKey) {
    trace(`not configured: agentId=${agentId ? "set" : "missing"} apiKey=${apiKey ? "set" : "missing"} — allowing (fail open)`);
    return 0; // fail open
  }

  let result: VerifyResult;
  try {
    const body: Record<string, unknown> = {
      agentId,
      action: "execute_command",
      vendor: "shell",
    };
    trace(`POST ${baseUrl}/api/verify ${JSON.stringify(body)}`);
    result = deps.verify
      ? await deps.verify(body)
      : await apiRequest<VerifyResult>("/api/verify", { method: "POST", body, apiKey, baseUrl });
    trace(
      `verify → allowed=${result.allowed} approvalRequired=${result.approvalRequired ?? false} reason=${JSON.stringify(result.reason)}`
    );
  } catch (err) {
    trace(`verification unavailable (${err instanceof Error ? err.message : String(err)}) — allowing (fail open)`);
    return 0; // fail open
  }

  if (result.allowed) return 0; // allow: print nothing

  const needsApproval = result.approvalRequired === true || /approval/i.test(result.reason ?? "");
  const reason =
    result.reason ??
    (needsApproval ? "Approval required. Visit your Action Inbox to approve." : "Action not permitted.");
  stdout.write(JSON.stringify({ permission: "deny", reason }) + "\n");
  return 0;
}

// ── Google Antigravity PreToolUse gate ────────────────────────────────────────

/**
 * Enforcement posture for the Antigravity hook, persisted in ~/.behalf/config.json.
 *
 *   advisory  (default) — denials hard-block, but BehalfID outages, missing
 *               credentials, and malformed payloads fail OPEN with a warning,
 *               matching the Claude Code PreToolUse hook posture.
 *   required  — the gate fails CLOSED whenever it cannot produce a positive
 *               verification: BehalfID unreachable, API timeout, invalid or
 *               missing credentials, malformed hook payload, or a missing tool
 *               name. Suitable for enforced enterprise pilots.
 *
 * Stored in config (not env) because Antigravity executes hooks with a
 * sanitized environment — arbitrary env vars do not reach the hook process.
 */
export type AntigravityEnforcement = "advisory" | "required";

export function resolveAntigravityEnforcement(): AntigravityEnforcement {
  const value = readExtendedConfig().antigravityEnforcement;
  return value === "required" ? "required" : "advisory";
}

/** Hard cap on raw hook stdin; beyond this the payload is treated as malformed. */
export const ANTIGRAVITY_MAX_STDIN_BYTES = 32 * 1024 * 1024;

/** Deadline for the /api/verify round-trip made by the Antigravity gate. */
export const ANTIGRAVITY_VERIFY_TIMEOUT_MS = 10_000;

/**
 * Defensive view of the Antigravity PreToolUse stdin payload. Antigravity
 * follows the Gemini CLI / Claude Code hook convention (`tool_name` +
 * `tool_input`); camelCase and nested `toolCall` variants are tolerated so a
 * payload-shape drift downgrades to the documented fail-open/fail-closed
 * behavior instead of misreading the call.
 */
type AntigravityHookInput = {
  session_id?: string;
  cwd?: string;
  workspace_path?: string;
  tool_name?: string;
  toolName?: string;
  tool_input?: unknown;
  toolInput?: unknown;
  toolCall?: unknown;
  tool_call?: unknown;
  mcp_context?: unknown;
  mcpContext?: unknown;
};

export function extractAntigravityToolName(input: AntigravityHookInput): string | undefined {
  const direct = readNonEmptyString(input.tool_name) ?? readNonEmptyString(input.toolName);
  if (direct) return direct;
  const call = isRecord(input.toolCall) ? input.toolCall : isRecord(input.tool_call) ? input.tool_call : undefined;
  if (call) {
    return readNonEmptyString(call.name) ?? readNonEmptyString(call.tool_name) ?? readNonEmptyString(call.toolName);
  }
  return undefined;
}

export type AntigravityToolInputResult =
  | { ok: true; toolInput: Record<string, unknown> }
  | { ok: false };

/**
 * Extract the tool arguments object. Distinguishes "absent" (no argument
 * field at all — legitimate for zero-argument tools) from "malformed" (an
 * argument field is present but is not a JSON object). Malformed input is
 * never silently converted to `{}` — callers fail closed in required mode
 * and warn in advisory mode.
 */
export function extractAntigravityToolInput(input: AntigravityHookInput): AntigravityToolInputResult {
  if (input.tool_input !== undefined) {
    return isRecord(input.tool_input) ? { ok: true, toolInput: input.tool_input } : { ok: false };
  }
  if (input.toolInput !== undefined) {
    return isRecord(input.toolInput) ? { ok: true, toolInput: input.toolInput } : { ok: false };
  }
  const rawCall = input.toolCall ?? input.tool_call;
  if (rawCall !== undefined) {
    if (!isRecord(rawCall)) return { ok: false };
    if (rawCall.args !== undefined) {
      return isRecord(rawCall.args) ? { ok: true, toolInput: rawCall.args } : { ok: false };
    }
    if (rawCall.input !== undefined) {
      return isRecord(rawCall.input) ? { ok: true, toolInput: rawCall.input } : { ok: false };
    }
  }
  return { ok: true, toolInput: {} };
}

/**
 * Tools that pass through WITHOUT verification even in required mode.
 *
 * Every entry must be independently documented as a metadata-only local
 * listing operation — never inferred from the name alone. Evidence
 * (official Gemini CLI tool reference, the Apache-2.0 upstream of the
 * Antigravity CLI — docs/tools/file-system.md):
 *
 *   list_directory       "Lists the names of files and subdirectories
 *                         directly within a specified path." (read)
 *   glob                 "Finds files matching specific glob patterns
 *                         across the workspace." (read)
 *
 * These tools expose filesystem metadata such as names and directory
 * structure, but do not directly return file contents. Content-search tools
 * (grep_search and search_file_content) are intentionally excluded until live
 * payload captures establish their path/search-root argument schemas and they
 * can be mapped to read_file without guessing constraint-relevant fields.
 *
 * Any other unmapped tool is denied in required mode and allowed with an
 * explicit warning in advisory mode.
 */
export const ANTIGRAVITY_READONLY_TOOLS = new Set([
  "list_directory",
  "glob",
]);

export function isAntigravityReadonlyTool(toolName: string): boolean {
  const base = (toolName.trim().split(/[:/.]|__/).pop() ?? toolName).toLowerCase();
  return ANTIGRAVITY_READONLY_TOOLS.has(base);
}

/** MCP server name from the payload's mcp_context, when Antigravity provides one. */
export function extractAntigravityMcpServer(input: AntigravityHookInput): string | undefined {
  const ctx = isRecord(input.mcp_context) ? input.mcp_context : isRecord(input.mcpContext) ? input.mcpContext : undefined;
  if (!ctx) return undefined;
  return (
    readNonEmptyString(ctx.server_name) ??
    readNonEmptyString(ctx.serverName) ??
    readNonEmptyString(ctx.server) ??
    readNonEmptyString(ctx.name)
  );
}

/**
 * Map an Antigravity tool name (and its input) to a BehalfID action + resource.
 *
 * Antigravity's agent harness exposes Windsurf-heritage tool names
 * (write_to_file, replace_file_content, run_command, view_file, …) while the
 * CLI retains Gemini CLI-heritage names (write_file, replace,
 * run_shell_command, read_file, web_fetch, google_web_search). Both families
 * are mapped so the gate covers the IDE and the CLI:
 *
 *   write_to_file / replace_file_content / multi_replace_file_content /
 *   write_file / replace / edit_file / create_file       → write_file on filesystem
 *   delete_file / remove_file                            → write_file on filesystem (mutation)
 *   view_file / read_file / read_many_files /
 *   view_code_item                                       → read_file on filesystem
 *   run_command / run_shell_command / bash / powershell  → execute_command on shell
 *   web_fetch / google_web_search / search_web /
 *   read_url_content / browser_* (prefix)                → browse_web on hostname (or "web")
 *   mcp_{server}_{tool}, mcp__{server}__{tool}, or
 *   payload mcp_context                                  → mcp_tool on the MCP server name
 *   task / agent / run_subagent / spawn_subagent /
 *   delegate_task                                        → spawn_agent on agent
 *
 * Tolerant of casing, whitespace, and namespace/prefix wrappers, mirroring
 * mapToolToAction. Returns null for unmapped tools; the gate then applies the
 * unknown-tool policy (the metadata-only allowlist passes through, other
 * unknown tools warn in advisory mode and DENY in required mode).
 */
/**
 * Extract the MCP server name from an MCP-prefixed tool name. Two formats:
 *
 *   mcp_{serverName}_{toolName}  — documented Gemini CLI FQN (server names
 *                                  must not contain underscores upstream)
 *   mcp__{server}__{tool}        — Claude Code-style convention, kept as a
 *                                  provisional compatibility alias
 *
 * Returns "" when the name is MCP-prefixed but the server segment cannot be
 * extracted; callers treat "" as a missing server identity.
 */
export function mcpServerFromToolName(trimmed: string): string | null {
  if (/^mcp__/i.test(trimmed)) {
    return trimmed.split("__")[1] || "";
  }
  if (/^mcp_/i.test(trimmed)) {
    const rest = trimmed.slice("mcp_".length);
    return rest.split("_")[0] || "";
  }
  return null;
}

export function mapAntigravityToolToAction(
  toolName: string,
  toolInput: Record<string, unknown> = {},
  mcpServer?: string
): ActionMap | null {
  if (typeof toolName !== "string") return null;
  const trimmed = toolName.trim();
  if (!trimmed) return null;

  if (mcpServer) {
    return { action: "mcp_tool", resource: mcpServer };
  }
  const parsedServer = mcpServerFromToolName(trimmed);
  if (parsedServer !== null) {
    // "" signals an MCP call whose server identity could not be determined;
    // the gate treats that as a missing binding argument.
    return { action: "mcp_tool", resource: parsedServer };
  }

  const base = (trimmed.split(/[:/.]|__/).pop() ?? trimmed).toLowerCase();

  // IDE browser-subagent tools (browser_navigate, browser_click, …) are gated
  // uniformly as browse_web; the URL-bearing ones contribute a hostname.
  if (base.startsWith("browser_")) {
    return { action: "browse_web", resource: antigravityHostnameFromInput(toolInput) };
  }

  switch (base) {
    case "write_to_file":
    case "replace_file_content":
    case "multi_replace_file_content":
    case "write_file":
    case "replace":
    case "edit_file":
    case "create_file":
    case "delete_file":
    case "remove_file":
      return { action: "write_file", resource: "filesystem" };
    case "view_file":
    case "read_file":
    case "read_many_files":
    case "view_code_item":
      return { action: "read_file", resource: "filesystem" };
    case "run_command":
    case "run_shell_command":
    case "bash":
    case "powershell":
      return { action: "execute_command", resource: "shell" };
    case "web_fetch":
    case "google_web_search":
    case "search_web":
    case "read_url_content":
    case "webfetch":
    case "websearch":
      return { action: "browse_web", resource: antigravityHostnameFromInput(toolInput) };
    case "task":
    case "agent":
    case "run_subagent":
    case "spawn_subagent":
    case "delegate_task":
      return { action: "spawn_agent", resource: "agent" };
    default:
      return null;
  }
}

function antigravityHostnameFromInput(toolInput: Record<string, unknown>): string {
  const url =
    readNonEmptyString(toolInput.url) ??
    readNonEmptyString(toolInput.Url) ??
    readNonEmptyString(toolInput.uri);
  if (url) {
    try {
      return new URL(url).hostname || "web";
    } catch {
      return "web";
    }
  }
  return "web";
}

function extractAntigravityFilePath(toolInput: Record<string, unknown>): string | undefined {
  return (
    readNonEmptyString(toolInput.file_path) ??
    readNonEmptyString(toolInput.filePath) ??
    readNonEmptyString(toolInput.path) ??
    readNonEmptyString(toolInput.absolute_path) ??
    readNonEmptyString(toolInput.absolutePath) ??
    readNonEmptyString(toolInput.target_file) ??
    readNonEmptyString(toolInput.targetFile) ??
    readNonEmptyString(toolInput.TargetFile) ??
    readNonEmptyString(toolInput.notebook_path) ??
    readNonEmptyString(toolInput.notebookPath)
  );
}

function extractAntigravityCommand(toolInput: Record<string, unknown>): string | undefined {
  return (
    readNonEmptyString(toolInput.command) ??
    readNonEmptyString(toolInput.CommandLine) ??
    readNonEmptyString(toolInput.commandLine) ??
    readNonEmptyString(toolInput.command_line)
  );
}

/**
 * Build a sanitized, non-persisted policyContext for /api/verify from an
 * Antigravity tool call. Same contract as buildClaudePolicyContext: only
 * constraint-relevant fields (file path, command, cwd, home) are retained.
 * File contents, replacement bodies, prompts, and every other tool_input field
 * are never forwarded.
 */
export function buildAntigravityPolicyContext(opts: {
  toolName: string;
  action: string;
  cwd?: string;
  toolInput: Record<string, unknown>;
  home?: string;
}): AntigravityPolicyContext | null {
  const toolInput: ClaudePolicyToolInput = {};
  const filePath = extractAntigravityFilePath(opts.toolInput);
  const command = extractAntigravityCommand(opts.toolInput);

  if ((opts.action === "write_file" || opts.action === "read_file") && filePath) {
    toolInput.filePath = filePath;
  }
  if (opts.action === "execute_command" && command) {
    toolInput.command = command;
  }

  const hasToolInput = toolInput.filePath !== undefined || toolInput.command !== undefined;
  const cwd = readNonEmptyString(opts.cwd);
  const home =
    toolInput.filePath !== undefined
      ? readNonEmptyString(opts.home) ?? resolveHomeDir()
      : undefined;

  if (!hasToolInput && !cwd && !home) {
    return null;
  }

  const ctx: AntigravityPolicyContext = {
    source: "antigravity",
    toolName: opts.toolName,
  };
  if (cwd) ctx.cwd = cwd;
  if (home) ctx.home = home;
  if (hasToolInput) ctx.toolInput = toolInput;
  return ctx;
}

export type AntigravityBindingResult = { ok: true } | { ok: false; problem: string };

/**
 * Validate that the arguments needed to identify a mapped action are present.
 * A target-dependent verification must never be sent with an absent target
 * and then described as enforced — required mode denies locally instead, and
 * advisory mode proceeds only with an explicit warning.
 *
 * Minimum binding fields per action:
 *   execute_command         non-empty command string
 *   write_file / read_file  non-empty file path
 *   browse_web              URL for URL-navigation tools (read_url_content,
 *                           browser_navigate); URL or prompt for web_fetch
 *                           (its documented argument is a URL-carrying
 *                           prompt); non-empty query for search tools; other
 *                           browser interactions carry no target argument
 *   mcp_tool                non-empty MCP server identity (from mcp_context
 *                           or the tool-name FQN)
 *   spawn_agent             none (the action itself is the policy target)
 */
export function validateAntigravityBinding(
  mapped: ActionMap,
  toolName: string,
  toolInput: Record<string, unknown>
): AntigravityBindingResult {
  const base = (toolName.trim().split(/[:/.]|__/).pop() ?? toolName).toLowerCase();

  switch (mapped.action) {
    case "execute_command":
      if (!extractAntigravityCommand(toolInput)) {
        return { ok: false, problem: `shell command argument is missing or empty for ${base}` };
      }
      return { ok: true };
    case "write_file":
    case "read_file":
      if (!extractAntigravityFilePath(toolInput)) {
        return { ok: false, problem: `file path argument is missing or empty for ${base}` };
      }
      return { ok: true };
    case "browse_web": {
      const hasUrl = Boolean(
        readNonEmptyString(toolInput.url) ??
          readNonEmptyString(toolInput.Url) ??
          readNonEmptyString(toolInput.uri)
      );
      if (base === "read_url_content" || base === "browser_navigate") {
        return hasUrl ? { ok: true } : { ok: false, problem: `URL argument is missing for ${base}` };
      }
      if (base === "web_fetch" || base === "webfetch") {
        return hasUrl || Boolean(readNonEmptyString(toolInput.prompt))
          ? { ok: true }
          : { ok: false, problem: `URL or prompt argument is missing for ${base}` };
      }
      if (base === "google_web_search" || base === "search_web" || base === "websearch") {
        return readNonEmptyString(toolInput.query) ?? readNonEmptyString(toolInput.q)
          ? { ok: true }
          : { ok: false, problem: `search query argument is missing for ${base}` };
      }
      return { ok: true };
    }
    case "mcp_tool":
      if (!mapped.resource) {
        return { ok: false, problem: `MCP server identity could not be determined for ${base}` };
      }
      return { ok: true };
    default:
      return { ok: true };
  }
}

export type AntigravityHookDeps = {
  stdin?: () => Promise<string>;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  verify?: (body: Record<string, unknown>) => Promise<VerifyResult>;
  enforcement?: AntigravityEnforcement;
};

/**
 * The Antigravity PreToolUse gate. Reads an Antigravity tool call from stdin
 * and verifies it with BehalfID. Speaks both halves of Antigravity's hook
 * protocol so a deny holds across versions:
 *
 *   allow → print "{}" (explicit no-opinion) and exit 0. Never prints
 *           {"decision":"allow"} — a positive allow could suppress
 *           Antigravity's own native review/confirmation flow, and BehalfID
 *           must never weaken the user's local review settings.
 *   deny  → print {"decision":"deny","reason":...} on stdout, write the
 *           reason to stderr, and exit 2. Stdout JSON is Antigravity's
 *           documented decision channel; exit 2 is the inherited
 *           Gemini CLI / Claude Code blocking signal. Either alone blocks.
 *
 * Enforcement posture comes from ~/.behalf/config.json (see
 * resolveAntigravityEnforcement — Antigravity sanitizes hook env, so env vars
 * cannot carry it):
 *
 *   advisory (default): missing config, network/API errors, malformed
 *   payloads, unrecognized tools, and missing target arguments fail OPEN
 *   with an explicit stderr warning.
 *   required: all of those fail CLOSED (deny). In particular, unrecognized
 *   tools are denied by default (only the metadata-only allowlist in
 *   ANTIGRAVITY_READONLY_TOOLS passes through), and actions whose minimum
 *   binding arguments are missing or malformed are denied locally rather
 *   than verified without a target. Oversized policy context fails CLOSED
 *   in both modes.
 */
export async function runAntigravityHook(deps: AntigravityHookDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const readInput = deps.stdin ?? readStdin;
  const enforcement = deps.enforcement ?? resolveAntigravityEnforcement();
  const required = enforcement === "required";
  // Opt-in tracing. Note: Antigravity runs hooks with a sanitized environment,
  // so BEHALFID_DEBUG only takes effect when the hook is run manually. Never
  // dumps tool_input — it can contain file contents or secrets.
  const debug = process.env.BEHALFID_DEBUG === "1";
  const trace = (msg: string) => {
    if (debug) stderr.write(`BehalfID[debug]: ${msg}\n`);
  };

  const allow = (): number => {
    // "{}" is the documented no-opinion response; Antigravity's native
    // permission flow still applies to the call.
    stdout.write("{}\n");
    return 0;
  };
  const deny = (reason: string): number => {
    stdout.write(JSON.stringify({ decision: "deny", reason }) + "\n");
    stderr.write(`BehalfID: ${reason}\n`);
    return 2;
  };
  const failOpenOrClosed = (problem: string): number => {
    if (required) {
      return deny(`${problem} — failing closed (enforcement is required).`);
    }
    stderr.write(`BehalfID: ${problem} — allowing (fail open).\n`);
    return allow();
  };

  let raw = "";
  let input: AntigravityHookInput;
  try {
    raw = await readInput();
    if (Buffer.byteLength(raw, "utf8") > ANTIGRAVITY_MAX_STDIN_BYTES) {
      trace(`stdin exceeds ${ANTIGRAVITY_MAX_STDIN_BYTES} bytes`);
      return failOpenOrClosed("hook payload exceeds the safe size limit");
    }
    input = raw.trim() ? (JSON.parse(raw) as AntigravityHookInput) : {};
  } catch {
    trace(`could not parse ${raw.length} bytes of stdin as JSON`);
    return failOpenOrClosed("could not parse hook input");
  }
  if (!isRecord(input)) {
    trace(`stdin parsed to ${typeof input}, expected an object`);
    return failOpenOrClosed("hook input is not a JSON object");
  }
  trace(`payload keys: [${Object.keys(input).join(", ")}]`);

  const toolName = extractAntigravityToolName(input);
  trace(`received tool name=${JSON.stringify(toolName)}`);
  if (!toolName) {
    return failOpenOrClosed("hook payload has no tool name");
  }

  const inputResult = extractAntigravityToolInput(input);
  let toolInput: Record<string, unknown>;
  if (inputResult.ok) {
    toolInput = inputResult.toolInput;
  } else {
    // An argument field is present but is not a JSON object. Never silently
    // convert this to {} — required mode fails closed; advisory continues
    // with an explicit warning and no claim of full evaluation.
    trace("tool arguments present but not a JSON object");
    if (required) {
      return deny(
        `tool arguments for "${toolName}" are not a JSON object — failing closed (enforcement is required).`
      );
    }
    stderr.write(
      `BehalfID: tool arguments for "${toolName}" are not a JSON object — treating as missing; target policy constraints cannot be evaluated.\n`
    );
    toolInput = {};
  }
  const mcpServer = extractAntigravityMcpServer(input);

  const mapped = mapAntigravityToolToAction(toolName, toolInput, mcpServer);
  trace(
    `mapped ${JSON.stringify(toolName)} → ${mapped ? `${mapped.action} on ${mapped.resource || "(unknown)"}` : "null (unmapped tool)"}`
  );
  if (!mapped) {
    if (isAntigravityReadonlyTool(toolName)) {
      // Documented metadata-only local listing operation (see
      // ANTIGRAVITY_READONLY_TOOLS) — passes through in both modes.
      trace("allowlisted read-only tool");
      return allow();
    }
    // Unknown tool. New, renamed, plugin-supplied, or undocumented tools must
    // not bypass a required-mode gate; a name alone is not evidence of safety.
    if (required) {
      return deny(
        `unrecognized tool "${toolName}" is not permitted while enforcement is required. Add a BehalfID mapping or use advisory mode.`
      );
    }
    stderr.write(
      `BehalfID: unrecognized tool "${toolName}" — allowing without verification (advisory mode).\n`
    );
    return allow();
  }

  const binding = validateAntigravityBinding(mapped, toolName, toolInput);
  if (!binding.ok) {
    trace(`binding validation failed: ${binding.problem}`);
    if (required) {
      return deny(`${binding.problem} — failing closed (enforcement is required).`);
    }
    stderr.write(
      `BehalfID: ${binding.problem} — verifying without target arguments; target policy constraints cannot be evaluated.\n`
    );
  }
  // Advisory fallback for MCP calls whose server identity is unknown: verify
  // against the generic "mcp" resource rather than sending an empty vendor.
  const vendor = mapped.resource || "mcp";

  const config = readConfig();
  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  const apiKey = resolveApiKey();
  const baseUrl = resolveBaseUrl();

  if (!agentId || !apiKey) {
    trace(`not configured: agentId=${agentId ? "set" : "missing"} apiKey=${apiKey ? "set" : "missing"}`);
    return failOpenOrClosed("not configured (agent ID or API key missing)");
  }

  const policyContext = buildAntigravityPolicyContext({
    toolName,
    action: mapped.action,
    cwd: readNonEmptyString(input.cwd) ?? readNonEmptyString(input.workspace_path),
    toolInput,
  });

  if (policyContext) {
    const sizeErr = policyContextSizeError(policyContext);
    if (sizeErr) {
      trace(`policy context blocked: ${sizeErr}`);
      // Oversized local policy input fails CLOSED in both modes: proceeding
      // without constraint arguments would silently weaken path/command
      // evaluation.
      return deny("blocked — policy context too large to evaluate safely.");
    }
    if (policyContext.toolInput?.command !== undefined) trace("policy context: command present");
    if (policyContext.toolInput?.filePath !== undefined) trace("policy context: file path present");
    if (policyContext.cwd) trace("policy context: cwd present");
  }

  let result: VerifyResult;
  try {
    const body: Record<string, unknown> = {
      agentId,
      action: mapped.action,
      vendor,
    };
    if (policyContext) {
      body.policyContext = policyContext;
    }
    // Debug must never print commands, paths, file contents, or credentials.
    trace(
      `POST ${baseUrl}/api/verify action=${mapped.action} vendor=${vendor} policyContext=${policyContext ? "present" : "absent"}`
    );
    result = deps.verify
      ? await deps.verify(body)
      : await apiRequest<VerifyResult>("/api/verify", {
          method: "POST",
          body,
          apiKey,
          baseUrl,
          timeoutMs: ANTIGRAVITY_VERIFY_TIMEOUT_MS,
        });
    trace(
      `verify → allowed=${result.allowed} approvalRequired=${result.approvalRequired ?? false} reason=${JSON.stringify(result.reason)}`
    );
  } catch (err) {
    return failOpenOrClosed(
      `verification unavailable (${err instanceof Error ? err.message : String(err)})`
    );
  }

  if (result.allowed) return allow();

  const reason = result.reason ?? "Action not permitted.";
  const needsApproval = result.approvalRequired === true || /approval/i.test(reason);
  if (needsApproval) {
    return deny(
      "approval required. Visit your BehalfID Action Inbox to approve, then retry the action."
    );
  }
  return deny(`blocked — ${reason}`);
}

// ── Antigravity payload schema capture (diagnostic) ──────────────────────────

/** Default JSONL file for sanitized hook payload schema captures. */
export function defaultCaptureFile(): string {
  return join(CONFIG_DIR_PATH, "antigravity-captures.jsonl");
}

function jsonTypeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** Field name → JSON type name. Argument VALUES are never recorded. */
export function describeArgumentTypes(record: Record<string, unknown>): Record<string, string> {
  const shape: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    shape[key] = jsonTypeName(record[key]);
  }
  return shape;
}

export type CaptureSchemaDeps = {
  stdin?: () => Promise<string>;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  append?: (line: string) => void;
};

/**
 * Diagnostic hook used to capture the REAL shape of Antigravity's PreToolUse
 * payloads (see docs/ANTIGRAVITY.md "Capturing real hook payloads"). Records
 * only schema: the event name, top-level field names, the tool name, and
 * argument field names with their JSON types. Argument values, prompts, file
 * contents, paths, and credentials are never written.
 *
 * Always prints "{}" and exits 0 — the capture hook never blocks, never
 * verifies, and never alters agent behavior. It is a temporary diagnostic,
 * not an enforcement surface.
 */
export async function runCaptureSchemaHook(
  outFile?: string,
  deps: CaptureSchemaDeps = {}
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const readInput = deps.stdin ?? readStdin;
  const target = outFile || defaultCaptureFile();

  try {
    const raw = await readInput();
    let record: Record<string, unknown>;
    if (Buffer.byteLength(raw, "utf8") > ANTIGRAVITY_MAX_STDIN_BYTES) {
      record = { capturedAt: new Date().toISOString(), error: "payload exceeded size limit" };
    } else {
      let parsed: unknown;
      try {
        parsed = raw.trim() ? JSON.parse(raw) : {};
      } catch {
        parsed = undefined;
      }
      if (!isRecord(parsed)) {
        record = {
          capturedAt: new Date().toISOString(),
          error: "payload was not a JSON object",
          payloadBytes: Buffer.byteLength(raw, "utf8"),
        };
      } else {
        const input = parsed as AntigravityHookInput;
        const inputResult = extractAntigravityToolInput(input);
        const call = isRecord(input.toolCall) ? input.toolCall : isRecord(input.tool_call) ? input.tool_call : undefined;
        const mcpCtx = isRecord(input.mcp_context) ? input.mcp_context : isRecord(input.mcpContext) ? input.mcpContext : undefined;
        record = {
          capturedAt: new Date().toISOString(),
          eventName:
            readNonEmptyString((parsed as Record<string, unknown>).hook_event_name) ??
            readNonEmptyString((parsed as Record<string, unknown>).hookEventName) ??
            null,
          topLevelKeys: Object.keys(parsed),
          toolName: extractAntigravityToolName(input) ?? null,
          toolInputPresence: inputResult.ok ? (Object.keys(inputResult.toolInput).length > 0 ? "object" : "absent-or-empty") : "malformed",
          argumentTypes: inputResult.ok ? describeArgumentTypes(inputResult.toolInput) : null,
          nestedCallKeys: call ? Object.keys(call) : null,
          mcpContextKeys: mcpCtx ? Object.keys(mcpCtx) : null,
          payloadBytes: Buffer.byteLength(raw, "utf8"),
        };
      }
    }

    const line = JSON.stringify(record) + "\n";
    if (deps.append) {
      deps.append(line);
    } else {
      const dir = dirname(target);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      appendFileSync(target, line, { mode: 0o600 });
    }
  } catch (err) {
    stderr.write(
      `BehalfID: capture failed (${err instanceof Error ? err.message : String(err)}) — allowing.\n`
    );
  }

  stdout.write("{}\n");
  return 0;
}

export type HookCommandRunners = {
  preToolUse: () => Promise<number>;
  cursor: () => Promise<number>;
  antigravity: () => Promise<number>;
  captureSchema: (outFile?: string) => Promise<number>;
};

export function hookCommand(runners: HookCommandRunners = {
  preToolUse: runPreToolUse,
  cursor: runCursorHook,
  antigravity: runAntigravityHook,
  captureSchema: runCaptureSchemaHook,
}) {
  const cmd = new Command("hook").description(
    "internal hooks for AI tools (invoked by Claude Code, not run directly)"
  );

  cmd
    .command("pre-tool-use")
    .description("PreToolUse gate: read a Claude Code tool call on stdin and verify it with BehalfID")
    .action(async () => {
      process.exitCode = await runners.preToolUse();
    });

  cmd
    .command("cursor")
    .description("Cursor beforeShellExecution gate: read a shell command on stdin and emit Cursor's JSON deny/allow decision")
    .action(async () => {
      process.exitCode = await runners.cursor();
    });

  cmd
    .command("antigravity")
    .description("Antigravity PreToolUse gate: read an Antigravity tool call on stdin and verify it with BehalfID")
    .action(async () => {
      process.exitCode = await runners.antigravity();
    });

  cmd
    .command("capture-schema")
    .description(
      "diagnostic: record the sanitized SCHEMA of a hook payload (field names and JSON types only, never values) and allow the call"
    )
    .option("--out <file>", "append captures to this JSONL file (default: ~/.behalf/antigravity-captures.jsonl)")
    .action(async (opts: { out?: string }) => {
      process.exitCode = await runners.captureSchema(opts.out);
    });

  return cmd;
}
