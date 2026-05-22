import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { Command } from "commander";
import { resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig } from "../lib/config.js";
import { fetchAndCacheDetail, readCachedDetail } from "../lib/passport-cache.js";
import { getProjectSetupStatus, writeProjectSetup } from "../lib/mcp-setup.js";
import { runAction } from "../lib/output.js";

type ToolDef = {
  binary: string;
  contextFiles: string[];
  injectLine: string;
};

const TOOLS: Record<string, ToolDef> = {
  claude: {
    binary: "claude",
    contextFiles: ["CLAUDE.md"],
    injectLine: "@.behalf/context.md",
  },
  codex: {
    binary: "codex",
    contextFiles: ["AGENTS.md"],
    injectLine: "@.behalf/context.md",
  },
  cursor: {
    binary: "cursor",
    contextFiles: [".cursorrules"],
    injectLine: "@.behalf/context.md",
  },
};

function redactArg(arg: string): string {
  return arg.replace(/bhf_sk_[A-Za-z0-9._-]+/g, "bhf_sk_[redacted]");
}

type LaunchDeps = {
  spawn?: typeof spawnSync;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

export async function launchTool(toolKey: string, extraArgs: string[], deps: LaunchDeps = {}): Promise<number> {
  const tool = TOOLS[toolKey];
  if (!tool) throw new Error(`Unknown tool "${toolKey}". Supported: ${Object.keys(TOOLS).join(", ")}`);

  const config = readConfig();
  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  const apiKey = resolveApiKey();
  const baseUrl = resolveBaseUrl();
  const stderr = deps.stderr ?? process.stderr;
  const stdout = deps.stdout ?? process.stdout;
  const spawn = deps.spawn ?? spawnSync;

  if (!agentId) {
    throw new Error(
      "Agent ID not configured.\nRun: behalf config set agent-id <agentId>"
    );
  }
  if (!apiKey) {
    throw new Error(
      "API key not configured. MCP startup requires an agent API key.\nRun: behalf config set api-key <bhf_sk_xxx>"
    );
  }

  const cwd = process.cwd();
  const status = getProjectSetupStatus(cwd);

  // Fetch or refresh permissions
  let detail = readCachedDetail(agentId);
  if (!detail) {
    stderr.write("Fetching BehalfID permissions... ");
    detail = await fetchAndCacheDetail(agentId, baseUrl, false);
    stderr.write("done.\n");
  }

  const setup = writeProjectSetup(detail, { cwd });

  // Inject include into tool config files (idempotent)
  for (const fileName of tool.contextFiles) {
    const filePath = join(cwd, fileName);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf-8");
    if (!content.includes(tool.injectLine)) {
      writeFileSync(filePath, content + `\n\n${tool.injectLine}\n`);
    }
  }

  if (!status.contextExists || !status.hasBehalfServer) {
    stderr.write("Initialized BehalfID MCP project setup for this directory.\n");
  }

  stdout.write(
    `Launching ${tool.binary} with BehalfID MCP enforcement.\n` +
    `Agent: ${agentId}\n` +
    `Base URL: ${baseUrl}\n` +
    `Context: ${setup.contextFile}\n` +
    `MCP config: ${setup.mcpJsonFile}\n` +
    `Command: ${tool.binary}${extraArgs.length ? ` ${extraArgs.map(redactArg).join(" ")}` : ""}\n`
  );

  // Launch the tool
  const result: SpawnSyncReturns<Buffer> = spawn(tool.binary, extraArgs, { stdio: "inherit" });
  return result.status ?? 1;
}

function toolCommand(toolKey: string, description: string) {
  return new Command(toolKey)
    .description(description)
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .argument("[args...]", `arguments to pass to ${toolKey}`)
    .action(
      runAction(async (args: string[]) => {
        process.exit(await launchTool(toolKey, args));
      })
    );
}

export function runCommand() {
  return new Command("run")
    .description("launch an AI tool with BehalfID enforcement active")
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .argument("<tool>", `tool to launch: ${Object.keys(TOOLS).join(", ")}`)
    .argument("[args...]", "arguments to pass through to the tool")
    .action(
      runAction(async (toolKey: string, args: string[]) => {
        process.exit(await launchTool(toolKey, args));
      })
    );
}

export function claudeCommand() { return toolCommand("claude", "launch Claude Code with BehalfID enforcement"); }
export function codexCommand()  { return toolCommand("codex",  "launch Codex CLI with BehalfID enforcement"); }
