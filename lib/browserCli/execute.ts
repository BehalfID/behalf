import { accountScopeFilter } from "@/lib/accountAccess";
import { listAccountAgents } from "@/lib/accountAgents";
import { parseBehalfCommand, type ParsedBehalfCommand } from "@/lib/browserCli/parse";
import { getWorkspaceActor, type WorkspaceActor } from "@/lib/delegatedAuth";
import { connectToDatabase } from "@/lib/db";
import { checkAndIncrementVerifications } from "@/lib/quota";
import { serializeAgent } from "@/lib/dashboardData";
import { verifyAction } from "@/lib/verify";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";
import DeveloperUser from "@/models/DeveloperUser";

export type BrowserCliConfig = {
  agentId?: string;
  apiKey?: string;
  baseUrl?: string;
};

export type BrowserCliExecInput = {
  command: string;
  userId: string;
  email: string;
  activeAccountId: string | null;
  config: BrowserCliConfig;
};

export type BrowserCliExecResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  clear?: boolean;
  config?: BrowserCliConfig;
  statusHint?: number;
};

const HELP_TEXT = `BehalfID browser terminal

This terminal runs the BehalfID CLI surface only. OS shells and system binaries are rejected.

Usage:
  behalf --help
  behalf doctor
  behalf whoami
  behalf agents list
  behalf agents show <agentId>
  behalf permissions list <agentId>
  behalf verify <agentId> --action <action> [--vendor <vendor>] [--amount <n>]
  behalf logs [--agent-id <agentId>] [--limit <n>]
  behalf config get [key]
  behalf config set <key> <value>

Config keys: agent-id, api-key, base-url

Presets in the UI cover the common demo path.`;

function lines(...parts: Array<string | null | undefined | false>): string {
  return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join("\n");
}

function formatKv(rows: Record<string, string | number | boolean | null | undefined>): string {
  const keys = Object.keys(rows);
  const width = Math.max(...keys.map((k) => k.length), 1);
  return keys
    .map((key) => {
      const value = rows[key];
      const rendered = value === undefined || value === null ? "—" : String(value);
      return `${key.padEnd(width)}  ${rendered}`;
    })
    .join("\n");
}

async function requireActor(userId: string, activeAccountId: string | null): Promise<WorkspaceActor> {
  const actor = await getWorkspaceActor(userId, activeAccountId);
  if (!actor) {
    throw Object.assign(new Error("Workspace account required."), { statusHint: 403 });
  }
  return actor;
}

async function loadOwnedAgent(actor: WorkspaceActor, agentId: string) {
  const agent = await Agent.findOne({
    ...accountScopeFilter(actor.accountId),
    agentId
  })
    .select("agentId name status provider accountId developerUserId description connectionStatus")
    .lean();
  if (!agent) {
    throw Object.assign(new Error(`Agent not found: ${agentId}`), { statusHint: 404 });
  }
  return agent;
}

async function executeParsed(
  parsed: Exclude<ParsedBehalfCommand, { kind: "empty" }>,
  input: BrowserCliExecInput
): Promise<BrowserCliExecResult> {
  if (parsed.kind === "rejected") {
    return { ok: false, exitCode: 1, stdout: "", stderr: parsed.message, statusHint: 400 };
  }
  if (parsed.kind === "help") {
    return { ok: true, exitCode: 0, stdout: HELP_TEXT, stderr: "" };
  }
  if (parsed.kind === "clear") {
    return { ok: true, exitCode: 0, stdout: "", stderr: "", clear: true };
  }

  await connectToDatabase();
  const config = { ...input.config };

  if (parsed.kind === "config_get") {
    const view = {
      "agent-id": config.agentId ?? "(not set)",
      "api-key": config.apiKey ? "(set, redacted)" : "(not set)",
      "base-url": config.baseUrl ?? "(app origin)"
    };
    if (parsed.key) {
      const key = parsed.key.replace(/_/g, "-");
      const value = view[key as keyof typeof view];
      if (!value) {
        return {
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: `Unknown config key "${parsed.key}". Supported: agent-id, api-key, base-url.`,
          statusHint: 400
        };
      }
      return { ok: true, exitCode: 0, stdout: `${key}=${value}`, stderr: "" };
    }
    return { ok: true, exitCode: 0, stdout: formatKv(view), stderr: "" };
  }

  if (parsed.kind === "config_set") {
    const key = parsed.key.replace(/_/g, "-");
    if (key === "agent-id") config.agentId = parsed.value;
    else if (key === "api-key") config.apiKey = parsed.value;
    else if (key === "base-url") config.baseUrl = parsed.value.replace(/\/+$/, "");
    else {
      return {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: `Unknown config key "${parsed.key}". Supported: agent-id, api-key, base-url.`,
        statusHint: 400
      };
    }
    return {
      ok: true,
      exitCode: 0,
      stdout: `Updated ${key}.`,
      stderr: "",
      config
    };
  }

  if (parsed.kind === "whoami") {
    const actor = await requireActor(input.userId, input.activeAccountId);
    const user = await DeveloperUser.findOne({ userId: input.userId }).select("email emailVerified").lean();
    return {
      ok: true,
      exitCode: 0,
      stdout: formatKv({
        email: user?.email ?? input.email,
        userId: input.userId,
        accountId: actor.accountId,
        role: actor.role,
        emailVerified: user?.emailVerified !== false
      }),
      stderr: ""
    };
  }

  if (parsed.kind === "doctor") {
    const actor = await requireActor(input.userId, input.activeAccountId);
    const agents = await listAccountAgents(actor);
    const checks = [
      {
        name: "Session",
        status: "ok" as const,
        detail: `Authenticated as ${input.email}`
      },
      {
        name: "Workspace",
        status: "ok" as const,
        detail: `${actor.accountId} (${actor.role})`
      },
      {
        name: "Agents",
        status: agents.length > 0 ? ("ok" as const) : ("warn" as const),
        detail: agents.length > 0 ? `${agents.length} agent(s) in workspace` : "No agents yet — create one in the dashboard"
      },
      {
        name: "Default agent",
        status: config.agentId ? ("ok" as const) : ("warn" as const),
        detail: config.agentId ?? "Not set (behalf config set agent-id <id>)"
      },
      {
        name: "API key",
        status: config.apiKey ? ("ok" as const) : ("warn" as const),
        detail: config.apiKey
          ? "Configured for this terminal session (redacted)"
          : "Optional here — browser verify uses workspace ownership"
      },
      {
        name: "Browser terminal",
        status: "ok" as const,
        detail: "BehalfID CLI surface only (no OS shell)"
      }
    ];
    const stdout = checks
      .map((check) => {
        const icon = check.status === "ok" ? "✓" : check.status === "warn" ? "!" : "✗";
        return `${icon} ${check.name}: ${check.detail}`;
      })
      .join("\n");
    return { ok: true, exitCode: 0, stdout, stderr: "" };
  }

  if (parsed.kind === "agents_list") {
    const actor = await requireActor(input.userId, input.activeAccountId);
    const agents = await listAccountAgents(actor);
    if (agents.length === 0) {
      return { ok: true, exitCode: 0, stdout: "No agents found.", stderr: "" };
    }
    const stdout = agents
      .map((agent) => {
        const serialized = serializeAgent(agent);
        return formatKv({
          agentId: serialized.agentId,
          name: serialized.name,
          status: serialized.status,
          provider: serialized.provider
        });
      })
      .join("\n\n");
    return { ok: true, exitCode: 0, stdout, stderr: "" };
  }

  if (parsed.kind === "agents_show") {
    const actor = await requireActor(input.userId, input.activeAccountId);
    const agent = await loadOwnedAgent(actor, parsed.agentId);
    return {
      ok: true,
      exitCode: 0,
      stdout: formatKv({
        agentId: agent.agentId,
        name: agent.name,
        status: agent.status,
        provider: agent.provider,
        connection: agent.connectionStatus,
        description: agent.description || "—"
      }),
      stderr: ""
    };
  }

  if (parsed.kind === "permissions_list") {
    const actor = await requireActor(input.userId, input.activeAccountId);
    await loadOwnedAgent(actor, parsed.agentId);
    const permissions = await Permission.find({
      ...accountScopeFilter(actor.accountId),
      agentId: parsed.agentId
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("permissionId action resource status requiresApproval constraints")
      .lean();
    if (permissions.length === 0) {
      return { ok: true, exitCode: 0, stdout: "No permissions found.", stderr: "" };
    }
    const stdout = permissions
      .map((permission) =>
        formatKv({
          permissionId: permission.permissionId,
          action: permission.action,
          resource: permission.resource ?? "—",
          status: permission.status,
          requiresApproval: Boolean(permission.requiresApproval)
        })
      )
      .join("\n\n");
    return { ok: true, exitCode: 0, stdout, stderr: "" };
  }

  if (parsed.kind === "verify") {
    const actor = await requireActor(input.userId, input.activeAccountId);
    const agent = await loadOwnedAgent(actor, parsed.agentId);

    const quota = await checkAndIncrementVerifications(actor.accountId);
    if (!quota.allowed) {
      return {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: quota.reason ?? "Verification quota exceeded.",
        statusHint: 402
      };
    }

    const decision = await verifyAction({
      agentId: agent.agentId,
      accountId: actor.accountId,
      developerUserId: agent.developerUserId,
      agentStatus: agent.status,
      action: parsed.action,
      vendor: parsed.vendor,
      amount: parsed.amount,
      shadow: parsed.shadow
    });

    if (decision.shadow) {
      const sd = decision.shadowDecision;
      const wouldBe = sd?.allowed ? "✓ WOULD ALLOW" : "✗ WOULD DENY";
      return {
        ok: true,
        exitCode: 0,
        stdout: lines(
          `[shadow] ${wouldBe}`,
          formatKv({
            requestId: decision.requestId,
            reason: sd?.reason ?? decision.reason,
            risk: sd?.risk ?? decision.risk,
            mode: "shadow (not enforced)"
          })
        ),
        stderr: ""
      };
    }

    const allowed = decision.allowed;
    const approval = decision.approvalRequired
      ? `\nApproval required${decision.approvalId ? `: ${decision.approvalId}` : ""}`
      : "";
    return {
      ok: allowed,
      exitCode: allowed ? 0 : 1,
      stdout: lines(
        allowed ? "✓ ALLOWED" : "✗ DENIED",
        formatKv({
          requestId: decision.requestId,
          reason: decision.reason,
          risk: decision.risk,
          approvalRequired: Boolean(decision.approvalRequired),
          approvalId: decision.approvalId
        }) + approval
      ),
      stderr: ""
    };
  }

  if (parsed.kind === "logs") {
    const actor = await requireActor(input.userId, input.activeAccountId);
    const agentId = parsed.agentId ?? config.agentId;
    if (agentId) await loadOwnedAgent(actor, agentId);
    const logs = await VerificationLog.find({
      ...accountScopeFilter(actor.accountId),
      ...(agentId ? { agentId } : {})
    })
      .sort({ createdAt: -1 })
      .limit(parsed.limit ?? 10)
      .select("requestId agentId action vendor allowed approvalRequired reason risk createdAt")
      .lean();
    if (logs.length === 0) {
      return { ok: true, exitCode: 0, stdout: "No verification logs found.", stderr: "" };
    }
    const stdout = logs
      .map((log) =>
        formatKv({
          requestId: log.requestId,
          agentId: log.agentId,
          action: log.action,
          vendor: log.vendor ?? "—",
          decision: log.allowed ? "allowed" : log.approvalRequired ? "approval_required" : "denied",
          reason: log.reason,
          risk: log.risk,
          at: log.createdAt ? new Date(log.createdAt).toISOString() : "—"
        })
      )
      .join("\n\n");
    return { ok: true, exitCode: 0, stdout, stderr: "" };
  }

  return {
    ok: false,
    exitCode: 1,
    stdout: "",
    stderr: "Unsupported command.",
    statusHint: 400
  };
}

export async function executeBrowserCliCommand(input: BrowserCliExecInput): Promise<BrowserCliExecResult> {
  const command = input.command.trim();
  if (command.length > 2000) {
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "Command exceeds the 2000 character limit.",
      statusHint: 400
    };
  }

  const parsed = parseBehalfCommand(command);
  if (parsed.kind === "empty") {
    return { ok: true, exitCode: 0, stdout: "", stderr: "" };
  }

  try {
    return await executeParsed(parsed, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command failed.";
    const statusHint =
      typeof error === "object" && error && "statusHint" in error && typeof (error as { statusHint: unknown }).statusHint === "number"
        ? (error as { statusHint: number }).statusHint
        : 500;
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: message,
      statusHint
    };
  }
}
