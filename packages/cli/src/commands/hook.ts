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
  tool_name?: string;
  /** Defensive fallback: tolerate a camelCase field name from non-standard hosts. */
  toolName?: string;
  tool_input?: Record<string, unknown>;
};

type VerifyResult = {
  requestId?: string;
  allowed: boolean;
  approvalRequired?: boolean;
  reason?: string;
  risk?: string;
};

type ActionMap = { action: string; resource: string };

/**
 * Map a Claude Code tool name (and its input) to a BehalfID action + resource.
 *
 *   Write / Edit / MultiEdit → write_file      on filesystem
 *   Read                     → read_file       on filesystem
 *   Bash                     → execute_command on shell
 *   WebFetch / WebSearch     → browse_web      on the request hostname (or "web")
 *   mcp__<server>__<tool>    → mcp_tool        on the MCP server name
 *   Task                     → spawn_agent     on agent
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
  // unmapped because its segment is not exactly "edit").
  const base = (trimmed.split(/[:/.]|__/).pop() ?? trimmed).toLowerCase();

  switch (base) {
    case "write":
    case "edit":
    case "multiedit":
      return { action: "write_file", resource: "filesystem" };
    case "read":
      return { action: "read_file", resource: "filesystem" };
    case "bash":
      return { action: "execute_command", resource: "shell" };
    case "webfetch":
    case "websearch":
      return { action: "browse_web", resource: hostnameFromInput(toolInput) };
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

  const mapped = mapToolToAction(toolName, input.tool_input ?? {});
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

  let result: VerifyResult;
  try {
    const body: Record<string, unknown> = {
      agentId,
      action: mapped.action,
      vendor: mapped.resource,
    };
    trace(`POST ${baseUrl}/api/verify ${JSON.stringify(body)}`);
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
  trace(`command=${JSON.stringify(input.command)}`);

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
      process.exit(await runPreToolUse());
    });

  cmd
    .command("cursor")
    .description("Cursor beforeShellExecution gate: read a shell command on stdin and emit Cursor's JSON deny/allow decision")
    .action(async () => {
      process.exit(await runCursorHook());
    });

  return cmd;
}
