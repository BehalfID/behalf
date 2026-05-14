import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printKv, printSuccess, runAction } from "../lib/output.js";

type CreatePermissionResult = { permissionId: string; status: string };

export function permissionsCommand() {
  const cmd = new Command("permissions").description("manage agent permissions");

  cmd
    .command("create <agentId>")
    .description("create a permission for an agent (requires agent API key)")
    .requiredOption("-a, --action <action>", "action to permit (e.g. purchase, access_data, schedule)")
    .option("-r, --resource <resource>", "resource or vendor (e.g. amazon.com, gmail.com)")
    .option("-s, --scope <scope>", "plain-English scope description")
    .option("-d, --description <desc>", "permission description")
    .option("--template <template>", "template: purchase, access_data, create_content, schedule, custom")
    .option("--max-amount <n>", "maximum transaction amount (for purchase permissions)")
    .option("--expires <date>", "expiry date (ISO 8601, e.g. 2027-01-01)")
    .option("--allowed <actions>", "comma-separated allowed actions")
    .option("--blocked <actions>", "comma-separated blocked actions")
    .option("--requires-approval", "require human approval before acting")
    .option("-k, --api-key <key>", "agent API key (overrides config)")
    .action(
      runAction(async (agentId: string, opts: {
        action: string;
        resource?: string;
        scope?: string;
        description?: string;
        template?: string;
        maxAmount?: string;
        expires?: string;
        allowed?: string;
        blocked?: string;
        requiresApproval?: boolean;
        apiKey?: string;
      }) => {
        const apiKey = opts.apiKey ?? resolveApiKey();
        if (!apiKey) throw new Error("An agent API key is required. Set it with `behalf config set api-key <key>` or pass --api-key.");

        const baseUrl = resolveBaseUrl();
        const body: Record<string, unknown> = { agentId, action: opts.action };

        if (opts.resource) body.resource = opts.resource;
        if (opts.scope) body.scope = opts.scope;
        if (opts.description) body.description = opts.description;
        if (opts.template) body.template = opts.template;
        if (opts.requiresApproval) body.requiresApproval = true;
        if (opts.allowed) body.allowedActions = opts.allowed.split(",").map(s => s.trim()).filter(Boolean);
        if (opts.blocked) body.blockedActions = opts.blocked.split(",").map(s => s.trim()).filter(Boolean);

        if (opts.maxAmount || opts.expires || opts.resource) {
          const constraints: Record<string, unknown> = {};
          if (opts.maxAmount) constraints.maxAmount = Number(opts.maxAmount);
          if (opts.expires) constraints.expiresAt = new Date(opts.expires).toISOString();
          if (opts.resource) constraints.allowedVendors = [opts.resource];
          body.constraints = constraints;
        }

        const data = await apiRequest<CreatePermissionResult>("/api/permissions", {
          method: "POST", body, apiKey, baseUrl,
        });

        if (isJsonMode()) printJson(data);
        else printKv({ permissionId: data.permissionId, status: data.status });
      })
    );

  cmd
    .command("revoke <permissionId>")
    .description("revoke a permission (requires agent API key)")
    .option("-k, --api-key <key>", "agent API key (overrides config)")
    .action(
      runAction(async (permissionId: string, opts: { apiKey?: string }) => {
        const apiKey = opts.apiKey ?? resolveApiKey();
        if (!apiKey) throw new Error("An agent API key is required. Set it with `behalf config set api-key <key>` or pass --api-key.");

        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<{ revoked: boolean }>(
          `/api/permissions/${encodeURIComponent(permissionId)}/revoke`,
          { method: "POST", apiKey, baseUrl }
        );

        if (isJsonMode()) printJson(data);
        else printSuccess(`Permission ${permissionId} revoked.`);
      })
    );

  return cmd;
}
