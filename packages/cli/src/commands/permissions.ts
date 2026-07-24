import { Command } from "commander";
import { apiRequest, resolveBaseUrl } from "../lib/client.js";
import { readSession } from "../lib/config.js";
import { isJsonMode, printJson, printKv, printTable, runAction } from "../lib/output.js";

type CreatePermissionResult = { permissionId: string; status: string };

type Permission = {
  permissionId: string;
  action: string;
  resource?: string;
  status: string;
  expiresAt?: string;
};

function requireHumanAuth(developerToken?: string) {
  const session = readSession();
  if (!session && !developerToken) {
    throw new Error(
      "Permission grants require human authentication. Run `behalf login` or pass --developer-token."
    );
  }
}

export function permissionsCommand() {
  const cmd = new Command("permissions").description("manage agent permissions");

  cmd
    .command("list <agentId>")
    .description("list permissions for an agent")
    .action(
      runAction(async (agentId: string) => {
        requireHumanAuth();
        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<{ agent: unknown; permissions: Permission[] }>(
          `/api/dashboard/agents/${encodeURIComponent(agentId)}`,
          { baseUrl }
        );

        if (isJsonMode()) { printJson(data.permissions); return; }

        if (!Array.isArray(data.permissions) || data.permissions.length === 0) {
          console.log("No permissions for this agent.");
          return;
        }

        printTable(
          data.permissions.map((p) => ({
            permissionId: p.permissionId,
            action: p.action,
            resource: p.resource ?? "",
            status: p.status,
            expires: p.expiresAt ? p.expiresAt.slice(0, 10) : "never",
          }))
        );
      })
    );

  cmd
    .command("create <agentId>")
    .description("create a permission for an agent (requires login or developer token)")
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
    .option("--allowed-paths <patterns>", "comma-separated glob patterns for permitted file paths (write_file/read_file)")
    .option("--denied-paths <patterns>", "comma-separated glob patterns for blocked file paths (write_file/read_file)")
    .option("--denied-commands <substrings>", "comma-separated substrings that block execute_command actions")
    .option("--developer-token <token>", "developer API token (bhf_dev_...) instead of login session")
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
        allowedPaths?: string;
        deniedPaths?: string;
        deniedCommands?: string;
        developerToken?: string;
      }) => {
        requireHumanAuth(opts.developerToken);

        const baseUrl = resolveBaseUrl();
        const body: Record<string, unknown> = { agentId, action: opts.action };

        if (opts.resource) body.resource = opts.resource;
        if (opts.scope) body.scope = opts.scope;
        if (opts.description) body.description = opts.description;
        if (opts.template) body.template = opts.template;
        if (opts.requiresApproval) body.requiresApproval = true;
        if (opts.allowed) body.allowedActions = opts.allowed.split(",").map(s => s.trim()).filter(Boolean);
        if (opts.blocked) body.blockedActions = opts.blocked.split(",").map(s => s.trim()).filter(Boolean);

        if (opts.maxAmount || opts.expires || opts.resource || opts.allowedPaths || opts.deniedPaths || opts.deniedCommands) {
          const constraints: Record<string, unknown> = {};
          if (opts.maxAmount) constraints.maxAmount = Number(opts.maxAmount);
          if (opts.expires) constraints.expiresAt = new Date(opts.expires).toISOString();
          if (opts.resource) constraints.allowedVendors = [opts.resource];
          if (opts.allowedPaths) constraints.allowedPaths = opts.allowedPaths.split(",").map(s => s.trim()).filter(Boolean);
          if (opts.deniedPaths) constraints.deniedPaths = opts.deniedPaths.split(",").map(s => s.trim()).filter(Boolean);
          if (opts.deniedCommands) constraints.deniedCommands = opts.deniedCommands.split(",").map(s => s.trim()).filter(Boolean);
          body.constraints = constraints;
        }

        const data = await apiRequest<CreatePermissionResult>("/api/permissions", {
          method: "POST",
          body,
          baseUrl,
          developerToken: opts.developerToken,
          skipAuth: true
        });

        if (isJsonMode()) printJson(data);
        else printKv({ permissionId: data.permissionId, status: data.status });
      })
    );

  cmd
    .command("revoke <permissionId>")
    .description("revoke a permission (requires login or developer token)")
    .option("--developer-token <token>", "developer API token (bhf_dev_...) instead of login session")
    .action(
      runAction(async (permissionId: string, opts: { developerToken?: string }) => {
        requireHumanAuth(opts.developerToken);

        const baseUrl = resolveBaseUrl();
        const data = await apiRequest<{ revoked: boolean }>(
          `/api/permissions/${encodeURIComponent(permissionId)}/revoke`,
          { method: "POST", baseUrl, developerToken: opts.developerToken, skipAuth: true }
        );

        if (isJsonMode()) printJson(data);
        else printSuccess(`Permission ${permissionId} revoked.`);
      })
    );

  return cmd;
}

function printSuccess(message: string) {
  console.log(message);
}
