import { Command } from "commander";
import { apiRequest, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printKv, printSuccess, printTable, runAction } from "../lib/output.js";
import { patchConfig, readSession } from "../lib/config.js";

type Agent = {
  agentId: string;
  name: string;
  status: string;
  agentType?: string;
  provider?: string;
  description?: string;
  lastUsedAt?: string;
  createdAt: string;
};

function requireSession() {
  if (!readSession()) {
    throw new Error("This command requires you to be logged in. Run `behalf login`.");
  }
}

export function agentsCommand() {
  const cmd = new Command("agents").description("manage agents");

  cmd
    .command("list")
    .description("list all agents in your account")
    .action(
      runAction(async () => {
        requireSession();
        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<{ agents: Agent[] }>("/api/dashboard/agents", { baseUrl });

        if (isJsonMode()) { printJson(data); return; }

        if (!data.agents.length) {
          console.log("No agents yet. Run `behalf agents create --name <name>` to create one.");
          return;
        }

        printTable(
          data.agents.map(a => ({
            agentId: a.agentId,
            name: a.name,
            status: a.status,
            type: a.agentType ?? "native",
            provider: a.provider ?? "",
            created: a.createdAt.slice(0, 10),
          }))
        );
      })
    );

  cmd
    .command("create")
    .description("create a new agent")
    .requiredOption("-n, --name <name>", "agent name")
    .option("--type <type>", "agent type: native or connected (default: native)")
    .option("--provider <provider>", "provider (for connected agents): ollie, chatgpt, claude, etc.")
    .option("--description <desc>", "agent description")
    .option("--external-id <id>", "external agent ID (for connected agents)")
    .option("--external-label <label>", "external agent label (for connected agents)")
    .option("--save", "save the new agent ID and API key to ~/.behalf/config.json")
    .action(
      runAction(async (opts: {
        name: string;
        type?: string;
        provider?: string;
        description?: string;
        externalId?: string;
        externalLabel?: string;
        save?: boolean;
      }) => {
        requireSession();
        const baseUrl = resolveBaseUrl();
        const body: Record<string, string | undefined> = { name: opts.name };
        if (opts.type) body.agentType = opts.type;
        if (opts.provider) body.provider = opts.provider;
        if (opts.description) body.description = opts.description;
        if (opts.externalId) body.externalAgentId = opts.externalId;
        if (opts.externalLabel) body.externalAgentLabel = opts.externalLabel;

        const data = await apiRequest<{ agent: Agent; apiKey: string }>(
          "/api/dashboard/agents",
          { method: "POST", body, baseUrl }
        );

        if (opts.save) {
          patchConfig({ agentId: data.agent.agentId, apiKey: data.apiKey });
        }

        if (isJsonMode()) { printJson(data); return; }

        console.log(`\nAgent created: ${data.agent.agentId}`);
        console.log(`\nAPI Key (shown once — save it now):\n`);
        console.log(`  ${data.apiKey}\n`);

        if (opts.save) {
          console.log(`Saved agent ID and API key to config.`);
        } else {
          console.log(`To save to config, run:`);
          console.log(`  behalf config set agent-id ${data.agent.agentId}`);
          console.log(`  behalf config set api-key  ${data.apiKey}`);
        }
      })
    );

  cmd
    .command("show <agentId>")
    .description("show agent details and permissions")
    .action(
      runAction(async (agentId: string) => {
        requireSession();
        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<{ agent: Agent; permissions: unknown[] }>(
          `/api/dashboard/agents/${encodeURIComponent(agentId)}`,
          { baseUrl }
        );

        if (isJsonMode()) { printJson(data); return; }

        const a = data.agent;
        printKv({
          agentId: a.agentId,
          name: a.name,
          status: a.status,
          type: a.agentType ?? "native",
          provider: a.provider ?? "",
          description: a.description ?? "",
          "last used": a.lastUsedAt ?? "never",
          created: a.createdAt,
        });

        if (Array.isArray(data.permissions) && data.permissions.length) {
          console.log("\nPermissions:");
          printTable(
            (data.permissions as Record<string, unknown>[]).map(p => ({
              permissionId: String(p.permissionId ?? ""),
              action: String(p.action ?? ""),
              resource: String(p.resource ?? ""),
              status: String(p.status ?? ""),
              expires: p.expiresAt ? String(p.expiresAt).slice(0, 10) : "never",
            }))
          );
        } else {
          console.log("\nNo permissions.");
        }
      })
    );

  cmd
    .command("disable <agentId>")
    .description("disable an agent")
    .action(
      runAction(async (agentId: string) => {
        requireSession();
        const baseUrl = resolveBaseUrl();
        await apiRequest(`/api/dashboard/agents/${encodeURIComponent(agentId)}/disable`, { method: "POST", baseUrl });
        if (isJsonMode()) printJson({ disabled: true, agentId });
        else printSuccess(`Agent ${agentId} disabled.`);
      })
    );

  cmd
    .command("enable <agentId>")
    .description("enable a disabled agent")
    .action(
      runAction(async (agentId: string) => {
        requireSession();
        const baseUrl = resolveBaseUrl();
        await apiRequest(`/api/dashboard/agents/${encodeURIComponent(agentId)}/enable`, { method: "POST", baseUrl });
        if (isJsonMode()) printJson({ enabled: true, agentId });
        else printSuccess(`Agent ${agentId} enabled.`);
      })
    );

  cmd
    .command("rotate-key <agentId>")
    .description("rotate an agent's API key")
    .option("-k, --api-key <key>", "current agent API key (overrides config)")
    .action(
      runAction(async (agentId: string, opts: { apiKey?: string }) => {
        const baseUrl = resolveBaseUrl();
        const session = readSession();
        const data = await apiRequest<{ agentId: string; apiKey: string }>(
          session
            ? `/api/dashboard/agents/${encodeURIComponent(agentId)}/rotate-key`
            : `/api/agents/${encodeURIComponent(agentId)}/rotate-key`,
          { method: "POST", apiKey: opts.apiKey, baseUrl }
        );

        if (isJsonMode()) { printJson(data); return; }

        console.log(`\nNew API Key for ${agentId} (shown once — save it now):\n`);
        console.log(`  ${data.apiKey}\n`);
        console.log(`Run: behalf config set api-key ${data.apiKey}`);
      })
    );

  return cmd;
}
