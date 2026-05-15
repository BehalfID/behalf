import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { resolveBaseUrl } from "../lib/client.js";
import { readConfig } from "../lib/config.js";
import { generateContextMd, generateMcpJson } from "../lib/context-generator.js";
import { fetchAndCacheDetail, readCachedDetail } from "../lib/passport-cache.js";
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

async function launchTool(toolKey: string, extraArgs: string[]) {
  const tool = TOOLS[toolKey];
  if (!tool) throw new Error(`Unknown tool "${toolKey}". Supported: ${Object.keys(TOOLS).join(", ")}`);

  const config = readConfig();
  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  const baseUrl = resolveBaseUrl();

  if (!agentId) {
    throw new Error(
      "Agent ID not configured.\nRun: behalf config set agent-id <agentId>"
    );
  }

  const cwd = process.cwd();
  const behalfDir = join(cwd, ".behalf");
  const contextFile = join(behalfDir, "context.md");
  const mcpJsonPath = join(cwd, ".mcp.json");

  // Fetch or refresh permissions
  let detail = readCachedDetail(agentId);
  if (!detail) {
    process.stderr.write("Fetching BehalfID permissions… ");
    try {
      detail = await fetchAndCacheDetail(agentId, baseUrl, false);
      process.stderr.write("done.\n");
    } catch (err) {
      process.stderr.write(`failed (${err instanceof Error ? err.message : String(err)}).\n`);
      process.stderr.write("Continuing without live permissions. Run `behalf mcp init` to populate the cache.\n");
    }
  }

  // Write .behalf/context.md
  if (detail) {
    if (!existsSync(behalfDir)) mkdirSync(behalfDir, { recursive: true });
    writeFileSync(contextFile, generateContextMd(detail));
  }

  // Write .mcp.json (merge with existing)
  let existingMcp: Record<string, unknown> | null = null;
  if (existsSync(mcpJsonPath)) {
    try { existingMcp = JSON.parse(readFileSync(mcpJsonPath, "utf-8")); } catch { /* ignore */ }
  }
  writeFileSync(mcpJsonPath, generateMcpJson(existingMcp ?? undefined));

  // Inject include into tool config files (idempotent)
  for (const fileName of tool.contextFiles) {
    const filePath = join(cwd, fileName);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf-8");
    if (!content.includes(tool.injectLine)) {
      writeFileSync(filePath, content + `\n\n${tool.injectLine}\n`);
    }
  }

  // Launch the tool
  const result = spawnSync(tool.binary, extraArgs, { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function toolCommand(toolKey: string, description: string) {
  return new Command(toolKey)
    .description(description)
    .allowUnknownOption(true)
    .passThroughOptions(true)
    .argument("[args...]", `arguments to pass to ${toolKey}`)
    .action(
      runAction(async (args: string[]) => {
        await launchTool(toolKey, args);
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
        await launchTool(toolKey, args);
      })
    );
}

export function claudeCommand() { return toolCommand("claude", "launch Claude Code with BehalfID enforcement"); }
export function codexCommand()  { return toolCommand("codex",  "launch Codex CLI with BehalfID enforcement"); }
