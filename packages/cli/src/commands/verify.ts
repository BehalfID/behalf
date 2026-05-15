import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printKv, runAction } from "../lib/output.js";

type VerifyResult = { requestId: string; allowed: boolean; reason: string; risk: string };

export function verifyCommand() {
  return new Command("verify")
    .description("verify whether an agent may perform an action")
    .argument("<agentId>", "agent ID")
    .requiredOption("-a, --action <action>", "action to verify (e.g. purchase, access_data)")
    .option("-v, --vendor <vendor>", "vendor or resource (e.g. amazon.com, gmail.com)")
    .option("-r, --resource <resource>", "alias for --vendor")
    .option("--amount <n>", "transaction amount (for purchase actions)")
    .option("-k, --api-key <key>", "agent API key (overrides config)")
    .action(
      runAction(async (agentId: string, opts: {
        action: string;
        vendor?: string;
        resource?: string;
        amount?: string;
        apiKey?: string;
      }) => {
        const apiKey = opts.apiKey ?? resolveApiKey();
        if (!apiKey) throw new Error("An agent API key is required. Set it with `behalf config set api-key <key>` or pass --api-key.");

        const baseUrl = resolveBaseUrl();
        const body: Record<string, unknown> = { agentId, action: opts.action };
        const vendor = opts.vendor ?? opts.resource;
        if (vendor) body.vendor = vendor;
        if (opts.amount) body.amount = Number(opts.amount);

        const data = await apiRequest<VerifyResult>("/api/verify", {
          method: "POST", body, apiKey, baseUrl,
        });

        if (isJsonMode()) {
          printJson(data);
          if (!data.allowed) process.exit(1);
          return;
        }

        console.log(`\n${data.allowed ? "✓ ALLOWED" : "✗ DENIED"}`);
        printKv({ requestId: data.requestId, reason: data.reason, risk: data.risk });
        console.log("");

        if (!data.allowed) process.exit(1);
      })
    );
}
