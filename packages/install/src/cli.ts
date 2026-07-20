import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { resolvePackageVersion } from "./version.js";

export interface CreateCliProgramOptions {
  /** Override package version (useful in tests). */
  version?: string;
}

/**
 * Create the Commander program for the BehalfID installer CLI.
 *
 * Phase 1 registers the public command surface and global options.
 * Command handlers are wired in later phases once the installer core exists.
 */
export function createCliProgram(options: CreateCliProgramOptions = {}): Command {
  const version = options.version ?? resolvePackageVersion();

  const program = new Command();

  program
    .name("behalf-install")
    .description(
      "BehalfID AI Installation Framework — install, verify, upgrade, and uninstall BehalfID for AI coding agents",
    )
    .version(version)
    .option("--json", "emit machine-readable JSON output", false);

  program
    .command("install")
    .description("Install and configure BehalfID for detected AI coding agents")
    .option("--dry-run", "preview actions without writing files", false)
    .option("--force", "replace existing BehalfID registration", false)
    .option(
      "--clients <list>",
      "comma-separated client ids (cursor,claude-code,claude-desktop,codex,vscode,windsurf)",
    )
    .option("--verify-endpoint <url>", "override the verify API endpoint");

  program
    .command("doctor")
    .description("Verify installation health and emit a diagnostic report")
    .option("--verify-endpoint <url>", "override the verify API endpoint probed by doctor");

  program
    .command("upgrade")
    .description("Upgrade an existing BehalfID installation")
    .option("--dry-run", "preview actions without writing files", false)
    .option(
      "--clients <list>",
      "comma-separated client ids (cursor,claude-code,claude-desktop,codex,vscode,windsurf)",
    )
    .option("--verify-endpoint <url>", "override the verify API endpoint");

  program
    .command("uninstall")
    .description("Unregister BehalfID and remove installer-managed configuration")
    .option("--dry-run", "preview actions without writing files", false)
    .option(
      "--clients <list>",
      "comma-separated client ids (cursor,claude-code,claude-desktop,codex,vscode,windsurf)",
    )
    .option("--keep-state", "preserve persisted installer state", false);

  program
    .command("status")
    .description("Show current installation state");

  program.addHelpText(
    "after",
    `
Examples:
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

if (isExecutedAsCliEntrypoint()) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
