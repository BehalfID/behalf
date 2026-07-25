#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { setJsonMode, printCaughtError } from "./lib/output.js";
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
import { completionCommand } from "./commands/completion.js";
import { scanCommand } from "./commands/scan.js";
import { hookCommand } from "./commands/hook.js";
import { policyCommand } from "./commands/policy.js";
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
  .name("behalf")
  .description("Official CLI for BehalfID - agent permission management and enforcement")
  .version(version)
  .option("--json", "output machine-readable JSON when supported")
  .option("--no-banner", "suppress the interactive startup banner")
  // The examples below contain placeholder identifiers only. pragma: allowlist secret
  .addHelpText(
    "after",
    `
Examples:
  behalf login                                  log in via browser (device flow)
  behalf login --password                       log in with email and password
  behalf init                                   interactive setup wizard
  behalf agents list                            list all agents
  behalf agents create --name "My Bot" --save  create agent and save credentials
  behalf permissions list agent_xxx            list permissions for an agent
  behalf permissions create agent_xxx --action purchase -r amazon.com
  behalf verify agent_xxx --action purchase -v amazon.com --amount 25
  behalf logs tail                              stream verification logs live
  behalf webhooks listen                        stream webhook events live
  behalf policy validate ./policy.yaml          validate a local guardrail policy
  behalf policy test ./policy.yaml --facts f.json  dry-run policy against sample facts
  behalf doctor                                 check CLI configuration
  behalf completion bash                       print bash completion script
  behalf profile install                        install managed shims for claude/codex/cursor
  behalf profile status                         show shim and policy status
  behalf pause --duration 30m --reason "..."    request a policy-approved pause lease
  behalf mcp init                               set up BehalfID enforcement in this directory
  behalf scan                                   inspect repo and suggest BehalfID policies
  behalf scan --json                            machine-readable policy suggestions
`
  );

program.enablePositionalOptions();
program.showSuggestionAfterError();
program.showHelpAfterError("(run behalf --help for available commands)");
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
program.addCommand(policyCommand());
program.addCommand(doctorCommand());
program.addCommand(profileCommand());
program.addCommand(shimLaunchCommand(), { hidden: true });
program.addCommand(pauseCommand());
program.addCommand(resumeCommand());
program.addCommand(scanCommand());
program.addCommand(hookCommand());
program.addCommand(completionCommand(program));

program.parseAsync(["", "", ...filteredArgs]).catch((err: unknown) => {
  printCaughtError(err);
  process.exit(1);
});
