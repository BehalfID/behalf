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

const TESTED_ANTIGRAVITY_CLI_VERSION = "1.1.2";
const ANTIGRAVITY_ENFORCEMENT_UNSUPPORTED =
  `Enforcement is unsupported on tested Antigravity CLI ${TESTED_ANTIGRAVITY_CLI_VERSION}: ` +
  "live validation showed that the host ignored a valid deny response and clean exit code 2.";
const ANTIGRAVITY_EXECUTION_WARNING =
  "Denied actions may still execute. Do not rely on this integration as an execution boundary.";

function integrationStatus(hookMode: ReturnType<typeof resolveAntigravityEnforcement>) {
  return {
    integration: "verification_and_audit",
    hookMode,
    enforcementSupported: false,
    liveEnforcementValidation: "failed",
    testedCliVersion: TESTED_ANTIGRAVITY_CLI_VERSION,
    failure: "The host ignored valid deny JSON and clean exit code 2, then executed the command.",
    warning: ANTIGRAVITY_EXECUTION_WARNING,
  };
}

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
    .description("install BehalfID verification/audit hooks and the advisory MCP server into Antigravity")
    .option("--dry-run", "show what would change without writing files")
    .option("--enforce", "unsupported: agy 1.1.2 ignored a valid live deny, so this option is rejected")
    .option("--advisory", "set hook decision handling to advisory (default): outages fail open")
    .option("--skip-mcp", "install only the PreToolUse verification hook, not the advisory MCP entry")
    .action(
      runAction(async (opts: { dryRun?: boolean; enforce?: boolean; advisory?: boolean; skipMcp?: boolean }) => {
        if (opts.enforce) {
          throw new Error(`--enforce is unsupported. ${ANTIGRAVITY_ENFORCEMENT_UNSUPPORTED} ${ANTIGRAVITY_EXECUTION_WARNING}`);
        }

        if (opts.dryRun) {
          const hookStatus = getAntigravityHookStatus();
          const mcpStatus = getAntigravityMcpStatus();
          const hookMode = opts.advisory ? "advisory" : resolveAntigravityEnforcement();
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
            ...integrationStatus(hookMode),
          };
          if (isJsonMode()) {
            printJson({ dryRun: true, ...summary });
            return;
          }
          console.log();
          console.log("Dry run — nothing written.");
          printKv({
            "hooks file": `${summary.hook.path} (${summary.hook.action})`,
            "hook decision mode": summary.hookMode,
            enforcement: "unsupported",
          });
          for (const m of summary.mcp) {
            printSuccess(`  mcp  ${m.path}  (${m.action})`);
          }
          console.log(ANTIGRAVITY_ENFORCEMENT_UNSUPPORTED);
          console.log(ANTIGRAVITY_EXECUTION_WARNING);
          console.log();
          return;
        }

        if (opts.advisory) {
          writeExtendedConfig({ antigravityEnforcement: "advisory" });
        }

        const hook = installAntigravityHook();
        if (!hook.ok) {
          throw new Error(`Could not install the Antigravity PreToolUse verification hook: ${formatInstallFailure(hook)}`);
        }

        const mcpResults = opts.skipMcp ? [] : installAntigravityMcpServer();
        const hookMode = resolveAntigravityEnforcement();

        if (isJsonMode()) {
          printJson({ hook, mcp: mcpResults, ...integrationStatus(hookMode) });
          return;
        }

        printSuccess(
          hook.changed
            ? `Installed BehalfID PreToolUse verification hook → ${hook.path}`
            : `BehalfID PreToolUse verification hook already installed → ${hook.path}`
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
        console.log(`Hook decision mode: ${hookMode}`);
        console.log("Verification and audit logging are active when agent credentials are configured and valid.");
        console.log(ANTIGRAVITY_ENFORCEMENT_UNSUPPORTED);
        console.log(ANTIGRAVITY_EXECUTION_WARNING);
        console.log();
        console.log("Restart Antigravity (IDE and any running `agy` sessions) to pick up the hook.");
      })
    );
}

function statusCommand() {
  return new Command("status")
    .description("show BehalfID's Antigravity verification, audit, and advisory MCP status")
    .action(
      runAction(async () => {
        const hook = getAntigravityHookStatus();
        const mcp = getAntigravityMcpStatus();
        const ext = readExtendedConfig();
        const hookMode = resolveAntigravityEnforcement();
        const configured = Boolean(ext.agentId && ext.apiKey);

        if (isJsonMode()) {
          printJson({ hook, mcp, configured, ...integrationStatus(hookMode) });
          return;
        }

        console.log();
        printKv({
          "PreToolUse verification hook": hook.status === "ok" ? `installed (${hook.path})` : `${hook.status} (${hook.path})`,
          "hook decision mode": hookMode,
          enforcement: `unsupported (tested agy ${TESTED_ANTIGRAVITY_CLI_VERSION})`,
          "agent credentials": configured ? "configured" : "missing — run `behalf init`",
        });
        console.log();
        console.log("Advisory MCP server entries");
        for (const m of mcp) {
          printKv({ [m.path]: m.status === "ok" ? "configured" : m.status });
        }
        console.log();
        if (hook.status !== "ok") {
          console.log("Run `behalf antigravity install` to install the verification and audit hook.");
        } else if (configured) {
          console.log("Verification and audit logging are active.");
        } else {
          console.log("Configure agent credentials with `behalf init` to activate verification and audit logging.");
        }
        console.log(ANTIGRAVITY_ENFORCEMENT_UNSUPPORTED);
        console.log(ANTIGRAVITY_EXECUTION_WARNING);
        console.log();
      })
    );
}

function uninstallCommand() {
  return new Command("uninstall")
    .description("remove the BehalfID verification hook and advisory MCP entries from Antigravity")
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
    "manage BehalfID verification and audit integration for Google Antigravity"
  );
  cmd.addCommand(installCommand());
  cmd.addCommand(statusCommand());
  cmd.addCommand(uninstallCommand());
  return cmd;
}
