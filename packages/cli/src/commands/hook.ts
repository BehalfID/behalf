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
 * Returns null for tools that have no BehalfID-gated equivalent (Glob, Grep,
 * TodoWrite, …); those are allowed through without a verify round-trip so the
 * agent keeps working.
 */
export function mapToolToAction(
  toolName: string,
  toolInput: Record<string, unknown> = {}
): ActionMap | null {
  // MCP tools are named mcp__<server>__<tool>.
  if (toolName.startsWith("mcp__")) {
    const server = toolName.split("__")[1] || "mcp";
    return { action: "mcp_tool", resource: server };
  }

  switch (toolName) {
    case "Write":
    case "Edit":
    case "MultiEdit":
      return { action: "write_file", resource: "filesystem" };
    case "Read":
      return { action: "read_file", resource: "filesystem" };
    case "Bash":
      return { action: "execute_command", resource: "shell" };
    case "WebFetch":
    case "WebSearch":
      return { action: "browse_web", resource: hostnameFromInput(toolInput) };
    case "Task":
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

  let input: HookInput;
  try {
    const raw = await readInput();
    input = raw.trim() ? (JSON.parse(raw) as HookInput) : {};
  } catch {
    stderr.write("BehalfID: could not parse hook input — allowing (fail open).\n");
    return 0;
  }

  const toolName = input.tool_name;
  if (!toolName) return 0;

  const mapped = mapToolToAction(toolName, input.tool_input ?? {});
  if (!mapped) return 0; // tool has no BehalfID-gated equivalent

  const config = readConfig();
  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  const apiKey = resolveApiKey();
  const baseUrl = resolveBaseUrl();

  if (!agentId || !apiKey) {
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
    result = deps.verify
      ? await deps.verify(body)
      : await apiRequest<VerifyResult>("/api/verify", { method: "POST", body, apiKey, baseUrl });
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

  return cmd;
}
