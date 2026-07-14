#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { setJsonMode } from "./lib/output.js";
import { maybePrintCliBanner } from "./lib/banner.js";
import { configCommand } from "./commands/config.js";
import { initCommand } from "./commands/init.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { agentsCommand } from "./commands/agents.js";
import { permissionsCommand } from "./commands/permissions.js";
import { verifyCommand } from "./commands/verify.js";
import { logsCommand } from "./commands/logs.js";
import { passportCommand } from "./commands/passport.js";
import { healthCommand } from "./commands/health.js";
import { mcpCommand } from "./commands/mcp.js";
import { runCommand, claudeCommand, codexCommand, cursorCommand, internalRefreshPermissionsCommand } from "./commands/run.js";
import { webhooksCommand } from "./commands/webhooks.js";
import { doctorCommand } from "./commands/doctor.js";
import { scanCommand } from "./commands/scan.js";
import { hookCommand } from "./commands/hook.js";
import { antigravityCommand } from "./commands/antigravity.js";
import {
  profileCommand,
  shimLaunchCommand,
  pauseCommand,
  resumeCommand,
} from "./commands/profile.js";

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const noBanner = rawArgs.includes("--no-banner");
if (jsonMode) setJsonMode(true);
const filteredArgs = rawArgs.filter((arg) => arg !== "--json" && arg !== "--no-banner");

maybePrintCliBanner({
  argv: filteredArgs,
  jsonMode,
  noBannerFlag: noBanner,
  stdoutIsTTY: process.stdout.isTTY
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

declare const __BEHALF_CLI_VERSION__: string | undefined;

const version =
  typeof __BEHALF_CLI_VERSION__ === "string"
    ? __BEHALF_CLI_VERSION__
    : (
        JSON.parse(
          readFileSync(join(__dirname, "../package.json"), "utf-8")
        ) as { version: string }
      ).version;

const program = new Command();

program
  .name("behalfid")
  .description("Official CLI for BehalfID — agent permission management and enforcement")
  .version(version)
  .option("--no-banner", "suppress the interactive startup banner")
  .addHelpText(
    "after",
    `
Examples:
  behalfid login                                  log in via browser (device flow)
  behalfid login --password                       log in with email and password
  behalfid init                                   interactive setup wizard
  behalfid agents list                            list all agents
  behalfid agents create --name "My Bot" --save  create agent and save credentials
  behalfid permissions list agent_xxx            list permissions for an agent
  behalfid permissions create agent_xxx --action purchase -r amazon.com
  behalfid verify agent_xxx --action purchase -v amazon.com --amount 25
  behalfid logs tail                              stream verification logs live
  behalfid webhooks listen                        stream webhook events live
  behalfid doctor                                 check CLI configuration
  behalfid profile install                        install managed shims for claude/codex/cursor  // pragma: allowlist secret
  behalfid profile status                         show shim and policy status  // pragma: allowlist secret
  behalfid pause --duration 30m --reason "..."    request a policy-approved pause lease  // pragma: allowlist secret
  behalfid mcp init                               set up BehalfID enforcement in this directory
  behalfid antigravity install                    install Antigravity verification/audit hook + advisory MCP
  behalfid antigravity status                     show Antigravity verification and audit status
  behalfid scan                                   inspect repo and suggest BehalfID policies
  behalfid scan --json                            machine-readable policy suggestions
`
  );

program.enablePositionalOptions();
program.addCommand(initCommand());
program.addCommand(configCommand());
program.addCommand(loginCommand());
program.addCommand(logoutCommand());
program.addCommand(whoamiCommand());
program.addCommand(agentsCommand());
program.addCommand(permissionsCommand());
program.addCommand(verifyCommand());
program.addCommand(logsCommand());
program.addCommand(passportCommand());
program.addCommand(healthCommand());
program.addCommand(mcpCommand());
program.addCommand(runCommand());
program.addCommand(claudeCommand());
program.addCommand(codexCommand());
program.addCommand(cursorCommand());
program.addCommand(internalRefreshPermissionsCommand(), { hidden: true });
program.addCommand(webhooksCommand());
program.addCommand(doctorCommand());
program.addCommand(profileCommand());
program.addCommand(shimLaunchCommand(), { hidden: true });
program.addCommand(pauseCommand());
program.addCommand(resumeCommand());
program.addCommand(scanCommand());
program.addCommand(hookCommand());
program.addCommand(antigravityCommand());

program.parseAsync(["", "", ...filteredArgs]).catch(err => {
  if (jsonMode) {
    console.error(JSON.stringify({ error: err.message }));
  } else {
    console.error(`Error: ${err.message}`);
  }
  process.exit(1);
});
