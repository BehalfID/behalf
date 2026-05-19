import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig } from "../lib/config.js";
import { isJsonMode, printJson, printTable, runAction } from "../lib/output.js";

type LogEntry = {
  requestId: string;
  action: string;
  vendor?: string;
  allowed: boolean;
  reason: string;
  risk: string;
  createdAt: string;
};

function formatRow(l: LogEntry) {
  return {
    requestId: l.requestId,
    action: l.action,
    vendor: l.vendor ?? "",
    allowed: l.allowed ? "yes" : "no",
    risk: l.risk,
    when: l.createdAt.replace("T", " ").slice(0, 19),
  };
}

export function logsCommand() {
  const cmd = new Command("logs").description("view verification logs");

  cmd
    .command("list [agentId]")
    .description("show recent verification logs")
    .option("-k, --api-key <key>", "agent API key (overrides config)")
    .action(
      runAction(async (agentId: string | undefined, opts: { apiKey?: string }) => {
        const resolvedId = agentId ?? readConfig().agentId;
        if (!resolvedId) throw new Error("Provide an agentId or set one with `behalfid config set agent-id <id>`.");
        const apiKey = opts.apiKey ?? resolveApiKey();
        if (!apiKey) throw new Error("An agent API key is required. Set it with `behalfid config set api-key <key>` or pass --api-key.");

        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<LogEntry[]>(`/api/logs/${encodeURIComponent(resolvedId)}`, { apiKey, baseUrl });

        if (isJsonMode()) { printJson(data); return; }

        if (!Array.isArray(data) || data.length === 0) {
          console.log("No logs yet.");
          return;
        }
        printTable(data.map(formatRow));
      })
    );

  cmd
    .command("tail [agentId]")
    .description("stream new verification logs as they arrive")
    .option("-k, --api-key <key>", "agent API key (overrides config)")
    .option("-i, --interval <seconds>", "poll interval in seconds (default: 4)", "4")
    .action(
      runAction(async (agentId: string | undefined, opts: { apiKey?: string; interval: string }) => {
        const resolvedId = agentId ?? readConfig().agentId;
        if (!resolvedId) throw new Error("Provide an agentId or set one with `behalfid config set agent-id <id>`.");
        const apiKey = opts.apiKey ?? resolveApiKey();
        if (!apiKey) throw new Error("An agent API key is required. Set it with `behalfid config set api-key <key>` or pass --api-key.");

        const baseUrl = resolveBaseUrl();
        const intervalMs = Math.max(Number(opts.interval) || 4, 2) * 1000;

        if (!isJsonMode()) {
          console.log(`Tailing logs for ${resolvedId}… (Ctrl+C to stop)\n`);
        }

        const seen = new Set<string>();
        let first = true;

        while (true) {
          try {
            const data = await apiRequest<LogEntry[]>(`/api/logs/${encodeURIComponent(resolvedId)}`, { apiKey, baseUrl });

            if (Array.isArray(data) && data.length > 0) {
              const fresh = data.filter((l) => !seen.has(l.requestId));
              for (const l of fresh) seen.add(l.requestId);

              if (!first && fresh.length > 0) {
                if (isJsonMode()) {
                  for (const l of fresh) console.log(JSON.stringify(l));
                } else {
                  printTable(fresh.map(formatRow));
                }
              } else if (first && !isJsonMode()) {
                // Show existing logs on first fetch
                printTable(data.map(formatRow));
                first = false;
              } else {
                first = false;
              }
            } else if (first) {
              if (!isJsonMode()) console.log("No logs yet. Waiting…");
              first = false;
            }
          } catch {
            // transient error — keep polling
          }

          await new Promise((r) => setTimeout(r, intervalMs));
        }
      })
    );

  return cmd;
}
