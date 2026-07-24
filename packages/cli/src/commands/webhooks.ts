import { Command } from "commander";
import { apiRequest, resolveBaseUrl } from "../lib/client.js";
import { requireSession } from "../lib/auth.js";
import { isJsonMode, printJson, printTable, runAction } from "../lib/output.js";

type WebhookEvent = {
  eventId: string;
  type: string;
  agentId?: string;
  status: string;
  createdAt: string;
  payload?: unknown;
};

export function webhooksCommand() {
  const cmd = new Command("webhooks").description("manage and stream webhook events");

  cmd
    .command("listen")
    .description("stream webhook events as they arrive")
    .option("-i, --interval <seconds>", "poll interval in seconds (default: 3)", "3")
    .option("--forward-to <url>", "forward raw event payloads to this local URL")
    .option("--events <types>", "comma-separated event types to filter (e.g. verify.allowed,verify.denied)")
    .action(
      runAction(async (opts: { interval: string; forwardTo?: string; events?: string }) => {
        requireSession();
        const baseUrl = resolveBaseUrl();
        const intervalMs = Math.max(Number(opts.interval) || 3, 2) * 1000;
        const filterTypes = opts.events ? new Set(opts.events.split(",").map(s => s.trim())) : null;

        if (!isJsonMode()) {
          console.log("Listening for webhook events… (Ctrl+C to stop)");
          if (opts.forwardTo) console.log(`  Forwarding to: ${opts.forwardTo}`);
          console.log();
        }

        const seen = new Set<string>();
        let first = true;

        while (true) {
          try {
            const data = await apiRequest<{ events: WebhookEvent[] }>(
              "/api/dashboard/webhook-events",
              { baseUrl }
            );

            const events = Array.isArray(data?.events) ? data.events : [];
            const fresh = events.filter((e) => !seen.has(e.eventId));
            for (const e of fresh) seen.add(e.eventId);

            const toShow = first
              ? events.slice(0, 5) // show last 5 on first fetch
              : fresh.filter((e) => !filterTypes || filterTypes.has(e.type));

            if (toShow.length > 0) {
              if (isJsonMode()) {
                for (const e of toShow) console.log(JSON.stringify(e));
              } else {
                printTable(
                  toShow.map((e) => ({
                    eventId: e.eventId,
                    type: e.type,
                    agentId: e.agentId ?? "",
                    status: e.status,
                    when: e.createdAt.replace("T", " ").slice(0, 19),
                  }))
                );
              }

              if (opts.forwardTo && !first) {
                for (const e of toShow) {
                  fetch(opts.forwardTo, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(e.payload ?? e),
                  }).catch(() => undefined);
                }
              }
            } else if (first && !isJsonMode()) {
              console.log("No recent events. Waiting for new ones…");
            }

            first = false;
          } catch {
            // transient error — keep polling
          }

          await new Promise((r) => setTimeout(r, intervalMs));
        }
      })
    );

  cmd
    .command("list")
    .description("list recent webhook endpoints")
    .action(
      runAction(async () => {
        requireSession();
        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<{ webhooks: { webhookId: string; url: string; events: string[]; status: string; createdAt: string }[] }>(
          "/api/dashboard/webhooks",
          { baseUrl }
        );

        if (isJsonMode()) { printJson(data); return; }

        if (!data.webhooks.length) {
          console.log("No webhook endpoints. Create one in the dashboard.");
          return;
        }

        printTable(
          data.webhooks.map((w) => ({
            webhookId: w.webhookId,
            url: w.url,
            events: w.events.join(", "),
            status: w.status,
            created: w.createdAt.slice(0, 10),
          }))
        );
      })
    );

  return cmd;
}
