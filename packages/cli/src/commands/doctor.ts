import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { readConfig, readSession, CONFIG_DIR_PATH, CONFIG_FILE_PATH } from "../lib/config.js";
import { isJsonMode, printJson, runAction } from "../lib/output.js";

type Check = {
  name: string;
  status: "ok" | "warn" | "error";
  detail: string;
};

function icon(status: Check["status"]) {
  return status === "ok" ? "✓" : status === "warn" ? "!" : "✗";
}

export function doctorCommand() {
  return new Command("doctor")
    .description("check your BehalfID CLI configuration and connectivity")
    .action(
      runAction(async () => {
        const checks: Check[] = [];

        // Config dir
        const { existsSync } = await import("node:fs");
        checks.push({
          name: "Config directory",
          status: existsSync(CONFIG_DIR_PATH) ? "ok" : "warn",
          detail: existsSync(CONFIG_DIR_PATH)
            ? CONFIG_DIR_PATH
            : `Not found — will be created on first login (expected: ${CONFIG_DIR_PATH})`,
        });

        // Session
        const session = readSession();
        checks.push({
          name: "Session",
          status: session ? "ok" : "warn",
          detail: session ? "Active session found" : "Not logged in — run `behalfid login`",
        });

        // Config file
        const config = readConfig();
        checks.push({
          name: "Config file",
          status: existsSync(CONFIG_FILE_PATH) ? "ok" : "warn",
          detail: existsSync(CONFIG_FILE_PATH) ? CONFIG_FILE_PATH : "Not found",
        });

        // Agent ID
        const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
        checks.push({
          name: "Agent ID",
          status: agentId ? "ok" : "warn",
          detail: agentId ? agentId : "Not set — run `behalfid config set agent-id <id>`",
        });

        // API key
        const apiKey = resolveApiKey();
        checks.push({
          name: "API key",
          status: apiKey ? "ok" : "warn",
          detail: apiKey ? `${apiKey.slice(0, 12)}…` : "Not set — run `behalfid config set api-key <key>`",
        });

        // Base URL
        const baseUrl = resolveBaseUrl();
        checks.push({
          name: "Base URL",
          status: "ok",
          detail: baseUrl,
        });

        // API connectivity
        try {
          await apiRequest("/api/health", { baseUrl, skipAuth: true });
          checks.push({ name: "API reachable", status: "ok", detail: baseUrl });
        } catch (err) {
          checks.push({
            name: "API reachable",
            status: "error",
            detail: err instanceof Error ? err.message : "Connection failed",
          });
        }

        // Auth check (if logged in)
        if (session) {
          try {
            const me = await apiRequest<{ user: { email: string } }>("/api/auth/me", { baseUrl });
            checks.push({
              name: "Auth valid",
              status: "ok",
              detail: (me as { user?: { email?: string } }).user?.email ?? "Authenticated",
            });
          } catch {
            checks.push({
              name: "Auth valid",
              status: "error",
              detail: "Session appears expired — run `behalfid login`",
            });
          }
        }

        if (isJsonMode()) {
          printJson(checks);
          return;
        }

        console.log();
        for (const c of checks) {
          const prefix = icon(c.status);
          const color =
            c.status === "ok" ? "\x1b[32m" :
            c.status === "warn" ? "\x1b[33m" :
            "\x1b[31m";
          const reset = "\x1b[0m";
          const label = c.name.padEnd(18);
          console.log(`  ${color}${prefix}${reset}  ${label}  ${c.detail}`);
        }
        console.log();

        const errors = checks.filter(c => c.status === "error");
        const warns = checks.filter(c => c.status === "warn");
        if (errors.length) {
          console.log(`  ${errors.length} error(s) found. Fix them before using the CLI.`);
        } else if (warns.length) {
          console.log(`  ${warns.length} warning(s). Some features may not work.`);
        } else {
          console.log("  Everything looks good.");
        }
        console.log();
      })
    );
}
