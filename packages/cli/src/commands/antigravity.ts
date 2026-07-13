import { Command } from "commander";
import { readExtendedConfig, writeExtendedConfig } from "../lib/config.js";
import { isJsonMode, printError, printJson, printKv, printSuccess, runAction } from "../lib/output.js";
import {
  getAntigravityHookStatus,
  getAntigravityMcpStatus,
  installAntigravityHook,
  installAntigravityMcpServer,
  uninstallAntigravityHook,
  uninstallAntigravityMcpServer,
  type AntigravityInstallResult,
} from "../lib/antigravity.js";
import { resolveAntigravityEnforcement } from "./hook.js";

function formatInstallFailure(result: Extract<AntigravityInstallResult, { ok: false }>): string {
  switch (result.code) {
    case "malformed":
      return `${result.path} is not valid JSON. Repair or back up the file, then re-run \`behalf antigravity install\`.`;
    case "unreadable":
      return `${result.path} is unreadable. Fix permissions on the file, then re-run \`behalf antigravity install\`.`;
    case "unwritable":
      return `${result.path} is not writable. Fix permissions on the file or directory, then re-run \`behalf antigravity install\`.`;
    case "unverified":
      return `The BehalfID entry could not be verified in ${result.path} after writing. Repair or back up the file, then re-run \`behalf antigravity install\`.`;
  }
}

function installCommand() {
  return new Command("install")
    .description("install the BehalfID PreToolUse gate and MCP server into Antigravity's config")
    .option("--dry-run", "show what would change without writing files")
    .option("--enforce", "set enforcement to required: the gate fails closed when BehalfID is unreachable")
    .option("--advisory", "set enforcement to advisory (default): outages fail open, denials still block")
    .option("--skip-mcp", "install only the PreToolUse gate, not the advisory MCP server entry")
    .action(
      runAction(async (opts: { dryRun?: boolean; enforce?: boolean; advisory?: boolean; skipMcp?: boolean }) => {
        if (opts.enforce && opts.advisory) {
          throw new Error("--enforce and --advisory are mutually exclusive.");
        }

        if (opts.dryRun) {
          const hookStatus = getAntigravityHookStatus();
          const mcpStatus = getAntigravityMcpStatus();
          const summary = {
            hook: {
              path: hookStatus.path,
              action: hookStatus.status === "ok" ? "unchanged" : hookStatus.status === "missing" ? "install" : `blocked (${hookStatus.status})`,
            },
            mcp: opts.skipMcp
              ? []
              : mcpStatus.map((s) => ({
                  path: s.path,
                  action: s.status === "ok" ? "unchanged" : s.status === "missing" ? "install (if file exists or is the shared config)" : `blocked (${s.status})`,
                })),
            enforcement: opts.enforce ? "required" : opts.advisory ? "advisory" : resolveAntigravityEnforcement(),
          };
          if (isJsonMode()) {
            printJson({ dryRun: true, ...summary });
            return;
          }
          console.log();
          console.log("Dry run — nothing written.");
          printKv({
            "hooks file": `${summary.hook.path} (${summary.hook.action})`,
            enforcement: String(summary.enforcement),
          });
          for (const m of summary.mcp) {
            printSuccess(`  mcp  ${m.path}  (${m.action})`);
          }
          console.log();
          return;
        }

        if (opts.enforce) {
          writeExtendedConfig({ antigravityEnforcement: "required" });
        } else if (opts.advisory) {
          writeExtendedConfig({ antigravityEnforcement: "advisory" });
        }

        const hook = installAntigravityHook();
        if (!hook.ok) {
          throw new Error(`Could not install the Antigravity PreToolUse gate: ${formatInstallFailure(hook)}`);
        }

        const mcpResults = opts.skipMcp ? [] : installAntigravityMcpServer();
        const enforcement = resolveAntigravityEnforcement();

        if (isJsonMode()) {
          printJson({ hook, mcp: mcpResults, enforcement });
          return;
        }

        printSuccess(
          hook.changed
            ? `Installed BehalfID PreToolUse gate → ${hook.path}`
            : `BehalfID PreToolUse gate already installed → ${hook.path}`
        );
        for (const mcp of mcpResults) {
          if (mcp.ok) {
            printSuccess(
              mcp.changed
                ? `Configured BehalfID MCP server → ${mcp.path}`
                : `BehalfID MCP server already configured → ${mcp.path}`
            );
          } else {
            printError(`MCP config skipped: ${formatInstallFailure(mcp)}`);
          }
        }
        console.log();
        console.log(`Enforcement mode: ${enforcement}`);
        if (enforcement === "advisory") {
          console.log("Denied actions are blocked; BehalfID outages fail open. Use --enforce for fail-closed.");
        } else {
          console.log("The gate fails closed when BehalfID is unreachable or the hook payload is malformed.");
        }
        console.log();
        console.log("Verify enforcement with the canary test in docs/ANTIGRAVITY.md before relying on it.");
        console.log("Restart Antigravity (IDE and any running `agy` sessions) to pick up the hook.");
      })
    );
}

function statusCommand() {
  return new Command("status")
    .description("show BehalfID's Antigravity hook, MCP, and enforcement status")
    .action(
      runAction(async () => {
        const hook = getAntigravityHookStatus();
        const mcp = getAntigravityMcpStatus();
        const ext = readExtendedConfig();
        const enforcement = resolveAntigravityEnforcement();

        if (isJsonMode()) {
          printJson({ hook, mcp, enforcement, configured: Boolean(ext.agentId && ext.apiKey) });
          return;
        }

        console.log();
        printKv({
          "PreToolUse gate": hook.status === "ok" ? `installed (${hook.path})` : `${hook.status} (${hook.path})`,
          enforcement,
          "agent credentials": ext.agentId && ext.apiKey ? "configured" : "missing — run `behalf init`",
        });
        console.log();
        console.log("MCP server entries");
        for (const m of mcp) {
          printKv({ [m.path]: m.status === "ok" ? "configured" : m.status });
        }
        console.log();
        if (hook.status !== "ok") {
          console.log("Run `behalf antigravity install` to install the PreToolUse gate.");
        } else {
          console.log("Confirm enforcement with the canary test in docs/ANTIGRAVITY.md.");
        }
        console.log();
      })
    );
}

function uninstallCommand() {
  return new Command("uninstall")
    .description("remove the BehalfID PreToolUse gate and MCP entries from Antigravity's config")
    .action(
      runAction(async () => {
        const hook = uninstallAntigravityHook();
        const mcp = uninstallAntigravityMcpServer();
        writeExtendedConfig({ antigravityEnforcement: undefined });

        if (isJsonMode()) {
          printJson({ hook, mcp });
          return;
        }

        printSuccess(`  ${hook.status.padEnd(10)}  hook  (${hook.path})`);
        for (const m of mcp) {
          printSuccess(`  ${m.status.padEnd(10)}  mcp   (${m.path})`);
        }
        console.log();
        console.log("Restart Antigravity (IDE and any running `agy` sessions) to drop the hook.");
      })
    );
}

export function antigravityCommand() {
  const cmd = new Command("antigravity").description(
    "manage BehalfID enforcement for Google Antigravity (IDE and agy CLI)"
  );
  cmd.addCommand(installCommand());
  cmd.addCommand(statusCommand());
  cmd.addCommand(uninstallCommand());
  return cmd;
}
