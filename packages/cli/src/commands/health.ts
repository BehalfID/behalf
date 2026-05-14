import { Command } from "commander";
import { apiRequest, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printKv, runAction } from "../lib/output.js";

export function healthCommand() {
  return new Command("health")
    .description("check API health")
    .option("--db", "also check database connectivity (requires setup token or console auth)")
    .action(
      runAction(async (opts: { db?: boolean }) => {
        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<Record<string, unknown>>("/api/health", { baseUrl });

        if (opts.db) {
          const dbData = await apiRequest<Record<string, unknown>>("/api/health/db", { baseUrl });
          const merged = { ...data, ...dbData };
          if (isJsonMode()) printJson(merged);
          else printKv(merged as Record<string, string>);
          return;
        }

        if (isJsonMode()) printJson(data);
        else printKv(data as Record<string, string>);
      })
    );
}
