import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig, readSession, CONFIG_DIR_PATH, CONFIG_FILE_PATH } from "../lib/config.js";
import { getProjectSetupStatus } from "../lib/mcp-setup.js";
import {
  getClaudePreToolUseHookStatus,
  hasCodexPreToolUseHook,
  hasCursorBeforeShellHook,
} from "./run.js";
import { getAntigravityHookStatus, hasAntigravityMcpServer } from "../lib/antigravity.js";
import { resolveAntigravityEnforcement } from "./hook.js";
import { isJsonMode, printJson, runAction } from "../lib/output.js";

type Check = {
  name: string;
  status: "ok" | "warn" | "error";
  detail: string;
  fix?: string;
};

export type DoctorCheck = Check;

function icon(status: Check["status"]) {
  return status === "ok" ? "✓" : status === "warn" ? "!" : "✗";
}

function looksLikeApiKey(apiKey: string | undefined): boolean {
  return !!apiKey && /^bhf_sk_[A-Za-z0-9._-]{8,}$/.test(apiKey);
}

function looksLikeAgentId(agentId: string | undefined): boolean {
  return !!agentId && /^agent_[A-Za-z0-9_-]+$/.test(agentId);
}

/** True if an executable named `binary` is found on any PATH entry. */
function isOnPath(binary: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) return false;
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      if (existsSync(join(dir, binary + ext))) return true;
    }
  }
  return false;
}

export async function runDoctorChecks(cwd = process.cwd()): Promise<Check[]> {
  const checks: Check[] = [];

  checks.push({
    name: "Config directory",
    status: existsSync(CONFIG_DIR_PATH) ? "ok" : "warn",
    detail: existsSync(CONFIG_DIR_PATH)
      ? CONFIG_DIR_PATH
      : `Not found (expected: ${CONFIG_DIR_PATH})`,
    fix: "Run `behalf init` or `behalf config set ...` to create it.",
  });

  const session = readSession();
  checks.push({
    name: "Session",
    status: session ? "ok" : "warn",
    detail: session ? "Active session found" : "Not logged in",
    fix: "Run `behalf login` if you need dashboard-scoped commands.",
  });

  const config = readConfig();
  checks.push({
    name: "Config file",
    status: existsSync(CONFIG_FILE_PATH) ? "ok" : "warn",
    detail: existsSync(CONFIG_FILE_PATH) ? CONFIG_FILE_PATH : "Not found",
    fix: "Run `behalf config set api-key <bhf_sk_xxx>` and `behalf config set agent-id <agent_xxx>`.",
  });

  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  checks.push({
    name: "Agent ID",
    status: agentId ? (looksLikeAgentId(agentId) ? "ok" : "warn") : "warn",
    detail: agentId ? (looksLikeAgentId(agentId) ? agentId : `${agentId} (unexpected format)`) : "Not set",
    fix: "Run `behalf config set agent-id <agent_xxx>`.",
  });

  const apiKey = resolveApiKey();
  checks.push({
    name: "API key",
    status: apiKey ? (looksLikeApiKey(apiKey) ? "ok" : "warn") : "warn",
    detail: apiKey ? "Configured (redacted)" : "Not set",
    fix: "Run `behalf config set api-key <bhf_sk_xxx>` with the one-time key from agent creation.",
  });

  const baseUrl = resolveBaseUrl();
  let parsedBaseUrl: URL | null = null;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    parsedBaseUrl = null;
  }
  checks.push({
    name: "Base URL",
    status: parsedBaseUrl && ["http:", "https:"].includes(parsedBaseUrl.protocol) ? "ok" : "error",
    detail: baseUrl,
    fix: "Run `behalf config set base-url https://behalfid.com` or your local app URL.",
  });

  if (parsedBaseUrl) {
    try {
      await apiRequest("/api/health", { baseUrl, skipAuth: true });
      checks.push({ name: "API health", status: "ok", detail: `${baseUrl}/api/health` });
    } catch (err) {
      checks.push({
        name: "API health",
        status: "error",
        detail: err instanceof Error ? err.message : "Connection failed",
        fix: "Check the base URL, network, and whether the BehalfID app is running.",
      });
    }
  }

  const project = getProjectSetupStatus(cwd);
  checks.push({
    name: "MCP config",
    status: project.mcpJsonExists ? (project.mcpJsonValid ? "ok" : "error") : "warn",
    detail: project.mcpJsonExists
      ? project.mcpJsonValid ? project.mcpJsonFile : `.mcp.json is invalid JSON: ${project.mcpJsonError}`
      : "Missing .mcp.json",
    fix: "Run `behalf mcp init` from the project directory.",
  });
  checks.push({
    name: "MCP server entry",
    status: project.hasBehalfServer ? "ok" : "warn",
    detail: project.hasBehalfServer ? "behalfid server configured" : "No behalfid server entry in .mcp.json",
    fix: "Run `behalf mcp init`; existing .mcp.json entries will be preserved.",
  });
  checks.push({
    name: "Context file",
    status: project.contextExists ? "ok" : "warn",
    detail: project.contextExists ? project.contextFile : "Missing .behalf/context.md",
    fix: "Run `behalf mcp init --refresh` to generate current permission context.",
  });

  const claudeHook = getClaudePreToolUseHookStatus();
  if (claudeHook.status === "ok") {
    checks.push({
      name: "Claude hook",
      status: "ok",
      detail: `BehalfID PreToolUse hook installed in ${claudeHook.path}`,
    });
  } else if (claudeHook.status === "malformed") {
    checks.push({
      name: "Claude hook",
      status: "error",
      detail: `${claudeHook.path} is not valid JSON; BehalfID enforcement cannot be verified`,
      fix: "Repair or back up the file, then run `behalf claude` again.",
    });
  } else if (claudeHook.status === "unreadable") {
    checks.push({
      name: "Claude hook",
      status: "error",
      detail: `${claudeHook.path} is unreadable; BehalfID enforcement cannot be verified`,
      fix: "Fix permissions on the file, then run `behalf claude` again.",
    });
  } else {
    checks.push({
      name: "Claude hook",
      status: "error",
      detail: `BehalfID PreToolUse hook not found in ${claudeHook.path}`,
      fix: "Run `behalf claude` to install it.",
    });
  }

  const codexHookInstalled = hasCodexPreToolUseHook();
  checks.push({
    name: "Codex hook",
    status: codexHookInstalled ? "ok" : "warn",
    detail: codexHookInstalled
      ? "BehalfID PreToolUse hook installed in ~/.codex/hooks.json"
      : "BehalfID PreToolUse hook not found in ~/.codex/hooks.json",
    fix: "Run `behalf codex` to install it.",
  });

  const cursorHookInstalled = hasCursorBeforeShellHook();
  checks.push({
    name: "Cursor hook",
    status: cursorHookInstalled ? "ok" : "warn",
    detail: cursorHookInstalled
      ? "BehalfID beforeShellExecution hook installed in ~/.cursor/hooks.json"
      : "BehalfID beforeShellExecution hook not found in ~/.cursor/hooks.json",
    fix: "Run `behalf cursor` to install it.",
  });

  const antigravityHook = getAntigravityHookStatus();
  if (antigravityHook.status === "ok") {
    checks.push({
      name: "Antigravity hook",
      status: "ok",
      detail: `BehalfID PreToolUse gate installed in ${antigravityHook.path} (${resolveAntigravityEnforcement()} mode)`,
    });
  } else if (antigravityHook.status === "missing") {
    checks.push({
      name: "Antigravity hook",
      status: "warn",
      detail: `BehalfID PreToolUse gate not found in ${antigravityHook.path}`,
      fix: "Run `behalf antigravity install` if you use Google Antigravity.",
    });
  } else {
    checks.push({
      name: "Antigravity hook",
      status: "error",
      detail: `${antigravityHook.path} is ${antigravityHook.status}; BehalfID enforcement cannot be verified`,
      fix: "Repair or back up the file, then run `behalf antigravity install` again.",
    });
  }

  checks.push({
    name: "Antigravity MCP",
    status: hasAntigravityMcpServer() ? "ok" : "warn",
    detail: hasAntigravityMcpServer()
      ? "BehalfID MCP server configured in Antigravity's mcp_config.json"
      : "BehalfID MCP server not found in Antigravity's mcp_config.json",
    fix: "Run `behalf antigravity install` if you use Google Antigravity.",
  });

  const cursorOnPath = isOnPath("cursor");
  checks.push({
    name: "Cursor CLI",
    status: cursorOnPath ? "ok" : "warn",
    detail: cursorOnPath ? "cursor found in PATH" : "cursor not found in PATH",
    fix: "cursor is not in PATH. Open Cursor, press Cmd+Shift+P, and run 'Install cursor command in PATH', then re-run behalf cursor.",
  });

  return checks;
}

export function doctorCommand() {
  return new Command("doctor")
    .description("check your BehalfID CLI configuration and connectivity")
    .action(
      runAction(async () => {
        const checks = await runDoctorChecks();

        if (isJsonMode()) {
          printJson(checks);
          return;
        }

        console.log();
        for (const c of checks) {
          const prefix = icon(c.status);
          const color =
            c.status === "ok" ? "\x1b[32m" :
            c.status === "warn" ? "\x1b[33m" :
            "\x1b[31m";
          const reset = "\x1b[0m";
          const label = c.name.padEnd(18);
          console.log(`  ${color}${prefix}${reset}  ${label}  ${c.detail}`);
          if (c.status !== "ok" && c.fix) {
            console.log(`      fix: ${c.fix}`);
          }
        }
        console.log();

        const errors = checks.filter(c => c.status === "error");
        const warns = checks.filter(c => c.status === "warn");
        if (errors.length) {
          console.log(`  ${errors.length} error(s) found. Fix them before using the CLI.`);
          process.exitCode = 1;
        } else if (warns.length) {
          console.log(`  ${warns.length} warning(s). Some features may not work.`);
        } else {
          console.log("  Everything looks good.");
        }
        console.log();
      })
    );
}
