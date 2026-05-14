import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printTable, runAction } from "../lib/output.js";

type LogEntry = { requestId: string; action: string; vendor?: string; allowed: boolean; reason: string; risk: string; createdAt: string };

export function logsCommand() {
  return new Command("logs")
    .description("show recent verification logs for an agent")
    .argument("<agentId>", "agent ID")
    .option("-k, --api-key <key>", "agent API key (overrides config)")
    .action(
      runAction(async (agentId: string, opts: { apiKey?: string }) => {
        const apiKey = opts.apiKey ?? resolveApiKey();
        if (!apiKey) throw new Error("An agent API key is required. Set it with `behalf config set api-key <key>` or pass --api-key.");

        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<LogEntry[]>(`/api/logs/${encodeURIComponent(agentId)}`, { apiKey, baseUrl });

        if (isJsonMode()) { printJson(data); return; }

        if (!Array.isArray(data) || data.length === 0) {
          console.log("No logs yet.");
          return;
        }

        printTable(data.map(l => ({
          requestId: l.requestId,
          action: l.action,
          vendor: l.vendor ?? "",
          allowed: l.allowed ? "yes" : "no",
          risk: l.risk,
          when: l.createdAt.replace("T", " ").slice(0, 19),
        })));
      })
    );
}
