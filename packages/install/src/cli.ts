import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { InstallerException } from "./installer/errors.js";
import { resolvePackageVersion } from "./version.js";
import type { CliHandlerContext } from "./cli/handlers.js";
import {
  createDefaultHandlerContext,
  handleDoctor,
  handleInstall,
  handleStatus,
  handleUninstall,
  handleUpgrade,
} from "./cli/handlers.js";

export interface CreateCliProgramOptions {
  /** Override package version (useful in tests). */
  version?: string;
  /** Inject a preconfigured installer stack (tests). */
  context?: CliHandlerContext;
}

/**
 * Create the Commander program for the BehalfID installer CLI.
 */
export function createCliProgram(options: CreateCliProgramOptions = {}): Command {
  const version = options.version ?? resolvePackageVersion();
  const ctx = options.context ?? createDefaultHandlerContext();

  const program = new Command();

  program
    .name("behalf-install")
    .description(
      "BehalfID AI Installation Framework — install, verify, upgrade, and uninstall BehalfID for AI coding agents",
    )
    .version(version)
    .option("--json", "emit machine-readable JSON output", false);

  program
    .command("install", { isDefault: true })
    .description("Install and configure BehalfID for detected AI coding agents")
    .option("--dry-run", "preview actions without writing files", false)
    .option("--force", "replace existing BehalfID registration", false)
    .option(
      "--clients <list>",
      "comma-separated client ids (cursor,claude-code,claude-desktop,codex,vscode,windsurf)",
    )
    .option("--verify-endpoint <url>", "override the verify API endpoint")
    .option("--agent-id <id>", "BehalfID agent id (or set BEHALFID_AGENT_ID)")
    .option("--api-key <key>", "BehalfID API key (or set BEHALFID_API_KEY)")
    .option(
      "--wrap",
      "rewrite existing stdio MCP servers to run through @behalfid/mcp-runtime",
      false,
    )
    .option(
      "--wrap-servers <list>",
      "comma-separated MCP server names to wrap when using --wrap",
    )
    .action(async (opts, command) => {
      await handleInstall(ctx, opts, command);
    });

  program
    .command("doctor")
    .description("Verify installation health and emit a diagnostic report")
    .option("--verify-endpoint <url>", "override the verify API endpoint probed by doctor")
    .action(async (opts, command) => {
      await handleDoctor(ctx, opts, command);
    });

  program
    .command("upgrade")
    .description("Upgrade an existing BehalfID installation")
    .option("--dry-run", "preview actions without writing files", false)
    .option(
      "--clients <list>",
      "comma-separated client ids (cursor,claude-code,claude-desktop,codex,vscode,windsurf)",
    )
    .option("--verify-endpoint <url>", "override the verify API endpoint")
    .option("--agent-id <id>", "BehalfID agent id (or set BEHALFID_AGENT_ID)")
    .option("--api-key <key>", "BehalfID API key (or set BEHALFID_API_KEY)")
    .option(
      "--wrap",
      "rewrite existing stdio MCP servers to run through @behalfid/mcp-runtime",
      false,
    )
    .option(
      "--wrap-servers <list>",
      "comma-separated MCP server names to wrap when using --wrap",
    )
    .action(async (opts, command) => {
      await handleUpgrade(ctx, opts, command);
    });

  program
    .command("uninstall")
    .description("Unregister BehalfID and remove installer-managed configuration")
    .option("--dry-run", "preview actions without writing files", false)
    .option(
      "--clients <list>",
      "comma-separated client ids (cursor,claude-code,claude-desktop,codex,vscode,windsurf)",
    )
    .option("--keep-state", "preserve persisted installer state", false)
    .action(async (opts, command) => {
      await handleUninstall(ctx, opts, command);
    });

  program
    .command("status")
    .description("Show current installation state")
    .action(async (opts, command) => {
      await handleStatus(ctx, opts, command);
    });

  program.addHelpText(
    "after",
    `
Examples:
  npx @behalfid/install
  npx @behalfid/install install
  npx @behalfid/install doctor --json
  npx @behalfid/install status
  npx @behalfid/install upgrade
  npx @behalfid/install uninstall
`,
  );

  return program;
}

/**
 * CLI entrypoint used by the `behalf-install` binary.
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createCliProgram();
  await program.parseAsync(argv);
}

function isExecutedAsCliEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  try {
    return fileURLToPath(import.meta.url) === resolve(entry);
  } catch {
    return false;
  }
}

function formatFatalCliError(error: unknown, json: boolean): string {
  if (error instanceof InstallerException) {
    const payload = error.toInstallerError();
    if (json) {
      return JSON.stringify({
        error: payload.message,
        code: payload.code,
        ...(payload.remediation !== undefined ? { remediation: payload.remediation } : {}),
        ...(payload.details !== undefined ? { details: payload.details } : {}),
      });
    }
    const lines = [`[${payload.code}] ${payload.message}`];
    if (payload.remediation) {
      lines.push(`→ ${payload.remediation}`);
    }
    return lines.join("\n");
  }

  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    return JSON.stringify({ error: message, code: "INTERNAL_ERROR" });
  }
  return message;
}

if (isExecutedAsCliEntrypoint()) {
  runCli().catch((error: unknown) => {
    const json = process.argv.includes("--json");
    console.error(formatFatalCliError(error, json));
    process.exitCode = 1;
  });
}
