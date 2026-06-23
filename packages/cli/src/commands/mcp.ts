import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig } from "../lib/config.js";
import { generateContextMd } from "../lib/context-generator.js";
import { fetchAndCacheDetail, readCachedDetail } from "../lib/passport-cache.js";
import { isJsonMode, printJson, printKv, runAction } from "../lib/output.js";
import { confirm } from "../lib/prompt.js";
import { readJsonFile, writeProjectSetup } from "../lib/mcp-setup.js";

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
        const apiKey = resolveApiKey();
        const baseUrl = resolveBaseUrl();

        if (!agentId) {
          throw new Error(
            "Agent ID not configured. Run `behalf config set agent-id <agentId>` first."
          );
        }
        if (!apiKey && !isJsonMode()) {
          console.warn(
            "Warning: API key is not configured. MCP startup will fail until you run `behalf config set api-key <bhf_sk_xxx>`."
          );
        }

        if (!isJsonMode()) console.log(`Initializing BehalfID enforcement for agent ${agentId}…\n`);

        // Fetch permissions
        let detail = opts.refresh ? null : readCachedDetail(agentId);
        if (!detail) {
          if (!isJsonMode()) process.stdout.write("Fetching permissions from server… ");
          detail = await fetchAndCacheDetail(agentId, baseUrl, opts.refresh ?? false, apiKey);
          if (!isJsonMode()) console.log("done.");
        } else {
          if (!isJsonMode()) console.log("Using cached permissions (run with --refresh to update).");
        }

        const cwd = process.cwd();
        if (opts.dryRun) {
          const setup = writeProjectSetup(detail, { cwd, dryRun: true });
          if (isJsonMode()) {
            printJson({
              initialized: false,
              dryRun: true,
              agentId,
              wouldChange: setup.changed,
              wouldPreserve: setup.preserved,
              warnings: apiKey ? [] : ["API key is not configured; MCP startup will fail until one is set."],
            });
          } else {
            console.log("Dry run. No files were written.\n");
            console.log("Would change:");
            for (const file of setup.changed) console.log(`  ${file}`);
            if (setup.preserved.length) {
              console.log("\nPreserved existing config:");
              for (const file of setup.preserved) console.log(`  ${file}`);
            }
            console.log("\n--- .behalf/context.md ---\n");
            console.log(generateContextMd(detail));
          }
          return;
        }

        const setup = writeProjectSetup(detail, { cwd });

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
          printJson({
            initialized: true,
            agentId,
            changed: setup.changed,
            preserved: setup.preserved,
            warnings: apiKey ? [] : ["API key is not configured; MCP startup will fail until one is set."],
          });
          return;
        }

        console.log("\nChanged:");
        for (const file of setup.changed) console.log(`  ${file}`);
        if (setup.preserved.length) {
          console.log("\nPreserved existing config:");
          for (const file of setup.preserved) console.log(`  ${file}`);
        }
        console.log("\nCurrent setup:");
        printKv({
          "context file": resolve(setup.contextFile),
          "mcp config": resolve(setup.mcpJsonFile),
          "api key": apiKey ? "configured" : "missing - run `behalf config set api-key <bhf_sk_xxx>`",
          permissions: `${detail.permissions.filter(p => p.status === "active").length} active`,
        });
        console.log(
          "\nNext commands:\n" +
          "  behalf doctor\n" +
          "  behalf mcp status\n" +
          "  behalf claude   # or: behalf codex\n"
        );
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
        const hasMcp = mcpJson.ok && !!(mcpJson.data?.mcpServers as Record<string, unknown> | undefined)?.behalfid;
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
