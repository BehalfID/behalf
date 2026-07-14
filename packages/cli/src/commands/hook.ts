import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig } from "../lib/config.js";

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
/** Bound action-time verification latency before applying the documented outage fallback. */
export const PRE_TOOL_USE_VERIFY_TIMEOUT_MS = 5_000;

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
export function policyContextSizeError(policyContext: ClaudePolicyContext): string | null {
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
 * Fails OPEN (returns 0 with a warning) on missing config or bounded
 * network/API errors, so a BehalfID outage does not indefinitely block the
 * agent.
 *
 * Malformed, missing-target, or oversized local policy input fails CLOSED
 * (exit 2): that is not a network outage, and proceeding without constraint
 * arguments would silently weaken path/command evaluation.
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
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error("hook input must be an object");
    input = parsed as HookInput;
  } catch {
    trace(`could not parse ${raw.length} bytes of stdin as JSON`);
    stderr.write("BehalfID: blocked — malformed hook input.\n");
    return 2;
  }
  trace("parsed hook payload");

  const toolName = readNonEmptyString(input.tool_name) ?? readNonEmptyString(input.toolName);
  trace(`received tool_name=${JSON.stringify(toolName)}`);
  if (!toolName) {
    trace("no usable tool_name in payload — blocking malformed input");
    stderr.write("BehalfID: blocked — malformed hook input.\n");
    return 2;
  }

  const rawToolInput = input.tool_input;
  if (rawToolInput !== undefined && !isRecord(rawToolInput)) {
    trace(`tool_input is ${typeof rawToolInput}, not an object — blocking malformed input`);
    stderr.write("BehalfID: blocked — malformed tool arguments.\n");
    return 2;
  }
  const toolInput: Record<string, unknown> = rawToolInput ?? {};

  const mapped = mapToolToAction(toolName, toolInput);
  trace(
    `mapped ${JSON.stringify(toolName)} → ${mapped ? `${mapped.action} on ${mapped.resource}` : "null (no BehalfID-gated equivalent)"}`
  );
  if (!mapped) return 0; // tool has no BehalfID-gated equivalent

  const missingCommand =
    mapped.action === "execute_command" && extractCommand(toolInput) === undefined;
  const missingFilePath =
    (mapped.action === "write_file" || mapped.action === "read_file") &&
    extractFilePath(toolInput) === undefined;
  if (missingCommand || missingFilePath) {
    trace(
      `mapped ${mapped.action} input is missing its required policy target — blocking malformed input`
    );
    stderr.write("BehalfID: blocked — required tool arguments are missing.\n");
    return 2;
  }

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
    // Debug must never print URLs, commands, paths, file contents, or credentials.
    trace(
      `POST /api/verify action=${mapped.action} vendor=${mapped.resource} policyContext=${policyContext ? "present" : "absent"}`
    );
    result = deps.verify
      ? await deps.verify(body)
      : await apiRequest<VerifyResult>("/api/verify", {
          method: "POST",
          body,
          apiKey,
          baseUrl,
          timeoutMs: PRE_TOOL_USE_VERIFY_TIMEOUT_MS,
        });
    trace(
      `verify → allowed=${result.allowed} approvalRequired=${result.approvalRequired ?? false}`
    );
  } catch {
    stderr.write("BehalfID: verification unavailable — allowing (fail open).\n");
    return 0;
  }

  if (result.allowed) return 0;

  const reason = result.reason ?? "Action not permitted.";
  const needsApproval = result.approvalRequired === true || /approval/i.test(reason);
  if (needsApproval) {
    stderr.write("BehalfID: approval required. Visit your Action Inbox to approve.\n");
  } else {
    stderr.write("BehalfID: blocked by policy.\n");
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

export function hookCommand() {
  const cmd = new Command("hook").description(
    "internal hooks for AI tools (invoked by Claude Code, not run directly)"
  );

  cmd
    .command("pre-tool-use")
    .description("PreToolUse gate: read a Claude Code tool call on stdin and verify it with BehalfID")
    .action(async () => {
      process.exitCode = await runPreToolUse();
    });

  cmd
    .command("cursor")
    .description("Cursor beforeShellExecution gate: read a shell command on stdin and emit Cursor's JSON deny/allow decision")
    .action(async () => {
      process.exitCode = await runCursorHook();
    });

  return cmd;
}
