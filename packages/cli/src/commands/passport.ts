import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printKv, printTable, runAction } from "../lib/output.js";

type PassportPermission = { action: string; resource?: string; scope?: string; status: string; expiresAt?: string };
type PassportResponse = {
  passportVersion: string;
  agent: { agentId: string; name: string; agentType?: string; provider?: string; description?: string };
  permissions: PassportPermission[];
};

export function passportCommand() {
  return new Command("passport")
    .description("show the public passport (active permissions) for an agent")
    .argument("<agentId>", "agent ID")
    .option("-k, --api-key <key>", "agent API key or passport token (overrides config)")
    .action(
      runAction(async (agentId: string, opts: { apiKey?: string }) => {
        const apiKey = opts.apiKey ?? resolveApiKey();
        if (!apiKey) throw new Error("An agent API key or passport token is required. Pass --api-key or set it with `behalf config set api-key <key>`.");

        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<PassportResponse>(`/api/passport/${encodeURIComponent(agentId)}`, { apiKey, baseUrl });

        if (isJsonMode()) { printJson(data); return; }

        printKv({
          agentId: data.agent.agentId,
          name: data.agent.name,
          type: data.agent.agentType ?? "native",
          provider: data.agent.provider ?? "",
          description: data.agent.description ?? "",
          version: data.passportVersion,
        });

        if (data.permissions.length === 0) {
          console.log("\nNo active permissions.");
        } else {
          console.log("\nPermissions:");
          printTable(data.permissions.map(p => ({
            action: p.action,
            resource: p.resource ?? "",
            scope: p.scope ?? "",
            status: p.status,
            expires: p.expiresAt ? p.expiresAt.slice(0, 10) : "never",
          })));
        }
      })
    );
}
