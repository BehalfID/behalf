import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig } from "../lib/config.js";
import { generateContextMd, generateMcpJson } from "../lib/context-generator.js";
import { fetchAndCacheDetail, readCachedDetail } from "../lib/passport-cache.js";
import { isJsonMode, printJson, printKv, runAction } from "../lib/output.js";
import { confirm } from "../lib/prompt.js";

function readJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function mcpCommand() {
  const cmd = new Command("mcp").description("BehalfID MCP server — real-time agent enforcement");

  cmd
    .command("start")
    .description("start the BehalfID MCP server on stdio (used by .mcp.json)")
    .action(
      runAction(async () => {
        const config = readConfig();
        const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
        const apiKey = resolveApiKey();
        const baseUrl = resolveBaseUrl();

        if (!agentId) {
          throw new Error(
            "Agent ID not configured. Run `behalf config set agent-id <agentId>` first."
          );
        }
        if (!apiKey) {
          throw new Error(
            "API key not configured. Run `behalf config set api-key <bhf_sk_xxx>` first."
          );
        }

        // Start the MCP server — this takes over the process
        const { startMcpServer } = await import("../lib/mcp-server.js");
        await startMcpServer({ agentId, apiKey, baseUrl });
      })
    );

  cmd
    .command("init")
    .description("set up BehalfID enforcement in the current directory")
    .option("--refresh", "force-refresh the permissions cache from the server")
    .option("--no-inject", "skip patching CLAUDE.md / AGENTS.md")
    .option("--dry-run", "show what would be written without writing anything")
    .action(
      runAction(async (opts: { refresh?: boolean; inject?: boolean; dryRun?: boolean }) => {
        const config = readConfig();
        const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
        const baseUrl = resolveBaseUrl();

        if (!agentId) {
          throw new Error(
            "Agent ID not configured. Run `behalf config set agent-id <agentId>` first."
          );
        }

        if (!isJsonMode()) console.log(`Initializing BehalfID enforcement for agent ${agentId}…\n`);

        // Fetch permissions
        let detail = opts.refresh ? null : readCachedDetail(agentId);
        if (!detail) {
          if (!isJsonMode()) process.stdout.write("Fetching permissions from server… ");
          detail = await fetchAndCacheDetail(agentId, baseUrl, opts.refresh ?? false);
          if (!isJsonMode()) console.log("done.");
        } else {
          if (!isJsonMode()) console.log("Using cached permissions (run with --refresh to update).");
        }

        const cwd = process.cwd();
        const behalfDir = join(cwd, ".behalf");
        const contextFile = join(behalfDir, "context.md");
        const mcpJsonFile = join(cwd, ".mcp.json");

        const contextMd = generateContextMd(detail);
        const existingMcp = readJsonFile(mcpJsonFile);
        const mcpJson = generateMcpJson(existingMcp ?? undefined);

        if (opts.dryRun) {
          if (isJsonMode()) {
            printJson({ wouldWrite: [contextFile, mcpJsonFile] });
          } else {
            console.log(`Would write:\n  ${contextFile}\n  ${mcpJsonFile}`);
            console.log("\n--- .behalf/context.md ---\n");
            console.log(contextMd);
          }
          return;
        }

        // Write .behalf/context.md
        if (!existsSync(behalfDir)) mkdirSync(behalfDir, { recursive: true });
        writeFileSync(contextFile, contextMd);

        // Write / merge .mcp.json
        writeFileSync(mcpJsonFile, mcpJson);

        // Inject into CLAUDE.md if present or if user confirms
        if (opts.inject !== false) {
          const claudeMdPath = join(cwd, "CLAUDE.md");
          const agentsMdPath = join(cwd, "AGENTS.md");

          for (const [label, path] of [["CLAUDE.md", claudeMdPath], ["AGENTS.md", agentsMdPath]] as const) {
            if (!existsSync(path)) continue;
            const content = readFileSync(path, "utf-8");
            const include = "@.behalf/context.md";
            if (content.includes(include)) continue;

            const ok = opts.dryRun
              ? false
              : await confirm(`Add \`${include}\` to ${label}?`, true);

            if (ok) {
              writeFileSync(path, content + `\n\n${include}\n`);
              if (!isJsonMode()) console.log(`  Patched ${label}.`);
            }
          }
        }

        if (isJsonMode()) {
          printJson({ initialized: true, agentId, contextFile, mcpJsonFile });
          return;
        }

        console.log("");
        printKv({
          "context file": resolve(contextFile),
          "mcp config": resolve(mcpJsonFile),
          permissions: `${detail.permissions.filter(p => p.status === "active").length} active`,
        });
        console.log(`\nBehalfID enforcement is active. Launch your AI tool normally — or run \`behalf claude\` to start Claude Code.\n`);
      })
    );

  cmd
    .command("status")
    .description("show current MCP config and cached permissions for this directory")
    .action(
      runAction(async () => {
        const config = readConfig();
        const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
        const cwd = process.cwd();

        const mcpJsonPath = join(cwd, ".mcp.json");
        const contextPath = join(cwd, ".behalf/context.md");

        const mcpJson = readJsonFile(mcpJsonPath);
        const hasMcp = !!(mcpJson?.mcpServers as Record<string, unknown> | undefined)?.behalfid;
        const hasContext = existsSync(contextPath);
        const cached = agentId ? readCachedDetail(agentId) : null;

        if (isJsonMode()) {
          printJson({ agentId, hasMcp, hasContext, cachedPermissions: cached?.permissions?.length ?? 0 });
          return;
        }

        printKv({
          "agent id": agentId ?? "(not set)",
          ".mcp.json": hasMcp ? "✓ behalfid server configured" : "✗ not configured",
          "context file": hasContext ? "✓ present" : "✗ missing",
          "cached permissions": cached ? `${cached.permissions.filter(p => p.status === "active").length} active` : "none (run mcp init)",
        });
      })
    );

  return cmd;
}
