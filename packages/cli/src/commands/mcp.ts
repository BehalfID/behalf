import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig } from "../lib/config.js";
import { generateContextMd } from "../lib/context-generator.js";
import { fetchAndCacheDetail, readCachedDetail } from "../lib/passport-cache.js";
import { isJsonMode, printJson, printKv, runAction } from "../lib/output.js";
import { confirm } from "../lib/prompt.js";
import { readJsonFile, writeProjectSetup } from "../lib/mcp-setup.js";
import { buildLocalInventory, buildWrapCommand } from "../lib/mcp-inventory.js";
import { runLocalMcpAudit } from "../lib/mcp-audit-runner.js";

async function pushAuditToDashboard(opts: {
  config: unknown;
  sourcePath: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiRequest("/api/cli/mcp-audit", {
      method: "POST",
      body: {
        config: opts.config,
        sourcePath: opts.sourcePath,
      },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error pushing audit. Log in with `behalf login` or set an agent API key.",
    };
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
          "  behalf mcp audit\n" +
          "  behalf claude   # or: behalf codex\n" +
          "  npx -y @behalfid/install --wrap   # hard-enforce other MCP servers\n"
        );
      })
    );

  cmd
    .command("status")
    .description("show current MCP config, wrap status, and cached permissions for this directory")
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
        const inventory = mcpJson.ok
          ? buildLocalInventory(mcpJson.data, mcpJsonPath)
          : null;

        if (isJsonMode()) {
          printJson({
            agentId,
            hasMcp,
            hasContext,
            cachedPermissions: cached?.permissions?.length ?? 0,
            inventory,
            wrapCommand: inventory
              ? buildWrapCommand(
                  inventory.servers.filter((s) => s.wrapStatus === "wrappable").map((s) => s.name)
                )
              : null,
          });
          return;
        }

        printKv({
          "agent id": agentId ?? "(not set)",
          ".mcp.json": hasMcp ? "✓ behalfid server configured" : "✗ not configured",
          "context file": hasContext ? "✓ present" : "✗ missing",
          "cached permissions": cached ? `${cached.permissions.filter(p => p.status === "active").length} active` : "none (run mcp init)",
        });

        if (inventory) {
          console.log("\nMCP servers:");
          if (inventory.servers.length === 0) {
            console.log("  (none)");
          } else {
            for (const server of inventory.servers) {
              console.log(`  ${server.name.padEnd(20)} ${server.wrapStatus}`);
            }
          }
          printKv({
            wrapped: String(inventory.wrappedCount),
            wrappable: String(inventory.wrappableCount),
            "url-only": String(inventory.urlOnlyCount),
          });
          if (inventory.wrappableCount > 0) {
            const names = inventory.servers
              .filter((s) => s.wrapStatus === "wrappable")
              .map((s) => s.name);
            console.log(`\nHard-enforce wrappable servers:\n  ${buildWrapCommand(names)}`);
          }
        }
      })
    );

  cmd
    .command("audit")
    .description("audit local MCP configuration and optionally sync the score to the dashboard")
    .argument("[path]", "MCP config file (defaults to .mcp.json)", ".mcp.json")
    .option("--push", "push the audit report to the BehalfID dashboard")
    .action(
      runAction(async (pathArg: string, opts: { push?: boolean }) => {
        const cwd = process.cwd();
        const sourcePath = resolve(cwd, pathArg);
        if (!existsSync(sourcePath)) {
          throw new Error(`MCP config not found: ${sourcePath}`);
        }

        const rawText = readFileSync(sourcePath, "utf-8");
        let raw: unknown;
        try {
          raw = JSON.parse(rawText);
        } catch {
          throw new Error(`Invalid JSON in ${sourcePath}`);
        }

        const report = await runLocalMcpAudit(raw, { sourcePath });
        const inventory = buildLocalInventory(raw, sourcePath);

        let pushResult: { ok: boolean; error?: string } | null = null;
        if (opts.push) {
          pushResult = await pushAuditToDashboard({
            config: raw,
            sourcePath,
          });
        }

        if (isJsonMode()) {
          printJson({
            sourcePath,
            report,
            inventory,
            wrapCommand: buildWrapCommand(
              inventory.servers.filter((s) => s.wrapStatus === "wrappable").map((s) => s.name)
            ),
            pushed: pushResult?.ok ?? false,
            pushError: pushResult?.error ?? null,
          });
          return;
        }

        console.log(`\nMCP audit — ${sourcePath}\n`);
        printKv({
          "security score": `${report.summary.securityScore}/100`,
          findings: String(report.summary.totalFindings),
          servers: String(report.summary.serverCount),
          critical: String(report.summary.bySeverity.critical ?? 0),
          high: String(report.summary.bySeverity.high ?? 0),
          medium: String(report.summary.bySeverity.medium ?? 0),
          low: String(report.summary.bySeverity.low ?? 0),
        });

        if (report.findings.length) {
          console.log("\nFindings:");
          for (const finding of report.findings.slice(0, 20)) {
            const scope = finding.serverName ? ` [${finding.serverName}]` : "";
            console.log(`  ${finding.severity.toUpperCase().padEnd(8)} ${finding.title}${scope}`);
            if (finding.remediation) console.log(`           → ${finding.remediation}`);
          }
          if (report.findings.length > 20) {
            console.log(`  … and ${report.findings.length - 20} more`);
          }
        }

        console.log("\nWrap status:");
        for (const server of inventory.servers) {
          console.log(`  ${server.name.padEnd(20)} ${server.wrapStatus}`);
        }

        const wrappable = inventory.servers
          .filter((s) => s.wrapStatus === "wrappable")
          .map((s) => s.name);
        if (wrappable.length) {
          console.log(`\nWrap command:\n  ${buildWrapCommand(wrappable)}`);
        }

        console.log(
          "\nDashboard:\n" +
            "  Open /dashboard/mcp to review inventory, scores, and remediation.\n" +
            "  Re-run with --push to sync this audit to your workspace."
        );

        if (opts.push) {
          if (pushResult?.ok) console.log("\n✓ Audit pushed to dashboard.");
          else console.log(`\n✗ Push failed: ${pushResult?.error ?? "unknown error"}`);
        }
      })
    );

  cmd
    .command("wrap")
    .description("print (or run) the install --wrap command for hard MCP enforcement")
    .option("--servers <list>", "comma-separated server names to wrap")
    .option("--run", "execute npx @behalfid/install --wrap instead of printing")
    .action(
      runAction(async (opts: { servers?: string; run?: boolean }) => {
        const cwd = process.cwd();
        const mcpJsonPath = join(cwd, ".mcp.json");
        const mcpJson = readJsonFile(mcpJsonPath);
        const inventory = mcpJson.ok ? buildLocalInventory(mcpJson.data, mcpJsonPath) : null;

        const names = opts.servers
          ? opts.servers.split(",").map((s) => s.trim()).filter(Boolean)
          : inventory?.servers.filter((s) => s.wrapStatus === "wrappable").map((s) => s.name) ?? [];

        const command = buildWrapCommand(names.length ? names : undefined);

        if (!opts.run) {
          if (isJsonMode()) {
            printJson({ command, servers: names, inventory });
            return;
          }
          console.log(
            "Hard enforcement wraps other stdio MCP servers with @behalfid/mcp-runtime.\n" +
              "Advisory `behalf mcp init` alone does not intercept third-party tools.\n"
          );
          console.log(`Command:\n  ${command}\n`);
          if (names.length) {
            console.log(`Targets: ${names.join(", ")}`);
          } else {
            console.log("No wrappable servers detected in .mcp.json — install will wrap all stdio servers it finds.");
          }
          console.log("\nPass --run to execute this command.");
          return;
        }

        const { spawn } = await import("node:child_process");
        const args = ["-y", "@behalfid/install", "--wrap"];
        if (names.length) {
          args.push("--wrap-servers", names.join(","));
        }
        await new Promise<void>((resolvePromise, reject) => {
          const child = spawn("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
          child.on("error", reject);
          child.on("exit", (code) => {
            if (code === 0) resolvePromise();
            else reject(new Error(`behalf-install exited with code ${code ?? 1}`));
          });
        });
      })
    );

  return cmd;
}
