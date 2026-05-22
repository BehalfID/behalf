import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig } from "../lib/config.js";
import { isJsonMode, printJson, printTable, redactSecrets, runAction } from "../lib/output.js";

type LogEntry = {
  requestId: string;
  agentName?: string | null;
  action: string;
  vendor?: string;
  amount?: number;
  allowed: boolean;
  reason: string;
  risk: string;
  createdAt: string;
};
type LogsPayload = LogEntry[] | { logs: LogEntry[] };
type LogOptions = {
  agent?: string;
  apiKey?: string;
  allowed?: boolean;
  denied?: boolean;
  risk?: string;
  action?: string;
  limit?: string;
  interval?: string;
};

function redactEntry(entry: LogEntry): LogEntry {
  return {
    ...entry,
    requestId: redactSecrets(entry.requestId),
    agentName: entry.agentName ? redactSecrets(entry.agentName) : entry.agentName,
    action: redactSecrets(entry.action),
    vendor: entry.vendor ? redactSecrets(entry.vendor) : entry.vendor,
    reason: redactSecrets(entry.reason)
  };
}

function formatRow(l: LogEntry) {
  return {
    when: l.createdAt.replace("T", " ").slice(0, 19),
    decision: l.allowed ? "allowed" : "denied",
    requestId: l.requestId,
    action: l.action,
    vendor: l.vendor ?? "",
    amount: typeof l.amount === "number" ? l.amount : "",
    risk: l.risk,
    reason: l.reason,
  };
}

function resolveAgentId(positional: string | undefined, opts: LogOptions) {
  return opts.agent ?? positional ?? readConfig().agentId;
}

function logPath(agentId: string, opts: LogOptions) {
  if (opts.allowed && opts.denied) throw new Error("Use either --allowed or --denied, not both.");
  const params = new URLSearchParams();
  if (opts.allowed) params.set("allowed", "true");
  if (opts.denied) params.set("allowed", "false");
  if (opts.risk) params.set("risk", opts.risk);
  if (opts.action) params.set("action", opts.action);
  if (opts.limit) params.set("limit", opts.limit);
  const query = params.toString();
  return `/api/logs/${encodeURIComponent(agentId)}${query ? `?${query}` : ""}`;
}

function unpackLogs(payload: LogsPayload) {
  return (Array.isArray(payload) ? payload : payload.logs).map(redactEntry);
}

export function logsCommand() {
  const cmd = new Command("logs").description("view verification logs");

  cmd
    .command("list [agentId]")
    .description("show recent verification logs")
    .option("--agent <agentId>", "agent ID (overrides positional/configured agent)")
    .option("-k, --api-key <key>", "agent API key (overrides config)")
    .option("--allowed", "show allowed decisions only")
    .option("--denied", "show denied decisions only")
    .option("--risk <risk>", "filter by risk: low, medium, or high")
    .option("--action <action>", "filter by action")
    .option("--limit <count>", "maximum logs to return")
    .action(
      runAction(async (agentId: string | undefined, opts: LogOptions) => {
        const resolvedId = resolveAgentId(agentId, opts);
        if (!resolvedId) throw new Error("Provide an agentId or set one with `behalfid config set agent-id <id>`.");
        const apiKey = opts.apiKey ?? resolveApiKey();
        if (!apiKey) throw new Error("An agent API key is required. Set it with `behalfid config set api-key <key>` or pass --api-key.");

        const baseUrl = resolveBaseUrl();
        const data = unpackLogs(await apiRequest<LogsPayload>(logPath(resolvedId, opts), { apiKey, baseUrl }));

        if (isJsonMode()) { printJson(data); return; }

        if (data.length === 0) {
          console.log("No logs yet.");
          return;
        }
        printTable(data.map(formatRow));
      })
    );

  cmd
    .command("tail [agentId]")
    .description("stream new verification logs as they arrive")
    .option("--agent <agentId>", "agent ID (overrides positional/configured agent)")
    .option("-k, --api-key <key>", "agent API key (overrides config)")
    .option("--allowed", "show allowed decisions only")
    .option("--denied", "show denied decisions only")
    .option("--risk <risk>", "filter by risk: low, medium, or high")
    .option("--action <action>", "filter by action")
    .option("--limit <count>", "maximum logs to fetch per poll")
    .option("-i, --interval <seconds>", "poll interval in seconds (default: 4)", "4")
    .action(
      runAction(async (agentId: string | undefined, opts: LogOptions) => {
        const resolvedId = resolveAgentId(agentId, opts);
        if (!resolvedId) throw new Error("Provide an agentId or set one with `behalfid config set agent-id <id>`.");
        const apiKey = opts.apiKey ?? resolveApiKey();
        if (!apiKey) throw new Error("An agent API key is required. Set it with `behalfid config set api-key <key>` or pass --api-key.");

        const baseUrl = resolveBaseUrl();
        const intervalMs = Math.max(Number(opts.interval) || 4, 2) * 1000;
        const path = logPath(resolvedId, opts);

        if (!isJsonMode()) {
          console.log(`Tailing logs for ${resolvedId}… (Ctrl+C to stop)\n`);
        }

        const seen = new Set<string>();
        let first = true;

        while (true) {
          try {
            const data = unpackLogs(await apiRequest<LogsPayload>(path, { apiKey, baseUrl }));

            if (data.length > 0) {
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
