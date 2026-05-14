#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { setJsonMode } from "./lib/output.js";
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
import { runCommand, claudeCommand, codexCommand } from "./commands/run.js";

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
if (jsonMode) setJsonMode(true);
const filteredArgs = rawArgs.filter(a => a !== "--json");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { version } = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
) as { version: string };

const program = new Command();

program
  .name("behalf")
  .description("Official CLI for BehalfID — agent permission management and enforcement")
  .version(version)
  .addHelpText(
    "after",
    `
Examples:
  behalf init                                     interactive setup wizard
  behalf login                                    log in to your account
  behalf agents create --name "My Bot" --save     create agent and save credentials
  behalf mcp init                                 set up BehalfID enforcement in this directory
  behalf claude                                   launch Claude Code with enforcement active
  behalf verify agent_xxx --action purchase -v amazon.com --amount 25
  behalf permissions create agent_xxx --action purchase -r amazon.com --max-amount 50
  behalf logs agent_xxx                           view recent verification logs
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

program.parseAsync(["", "", ...filteredArgs]).catch(err => {
  if (jsonMode) {
    console.error(JSON.stringify({ error: err.message }));
  } else {
    console.error(`Error: ${err.message}`);
  }
  process.exit(1);
});
