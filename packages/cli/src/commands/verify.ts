import { Command } from "commander";
import { apiRequest, resolveApiKey, resolveBaseUrl } from "../lib/client.js";
import { isJsonMode, printJson, printKv, runAction } from "../lib/output.js";

type ShadowDecision = { allowed: boolean; reason: string; risk: string };
type VerifyResult = {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: string;
  shadow?: boolean;
  shadowDecision?: ShadowDecision;
};

export function verifyCommand() {
  return new Command("verify")
    .description("verify whether an agent may perform an action")
    .argument("<agentId>", "agent ID")
    .requiredOption("-a, --action <action>", "action to verify (e.g. purchase, access_data)")
    .option("-v, --vendor <vendor>", "vendor or resource (e.g. amazon.com, gmail.com)")
    .option("-r, --resource <resource>", "alias for --vendor")
    .option("--amount <n>", "transaction amount (for purchase actions)")
    .option("-k, --api-key <key>", "agent API key (overrides config)")
    .option("--shadow", "shadow mode: evaluate policy without enforcing the decision")
    .action(
      runAction(async (agentId: string, opts: {
        action: string;
        vendor?: string;
        resource?: string;
        amount?: string;
        apiKey?: string;
        shadow?: boolean;
      }) => {
        const apiKey = opts.apiKey ?? resolveApiKey();
        if (!apiKey) throw new Error("An agent API key is required. Set it with `behalf config set api-key <key>` or pass --api-key.");

        const baseUrl = resolveBaseUrl();
        const body: Record<string, unknown> = { agentId, action: opts.action };
        const vendor = opts.vendor ?? opts.resource;
        if (vendor) body.vendor = vendor;
        if (opts.amount) body.amount = Number(opts.amount);
        if (opts.shadow) body.shadow = true;

        const data = await apiRequest<VerifyResult>("/api/verify", {
          method: "POST", body, apiKey, baseUrl,
        });

        if (isJsonMode()) {
          printJson(data);
          if (!data.shadow && !data.allowed) process.exit(1);
          return;
        }

        if (data.shadow) {
          const sd = data.shadowDecision;
          const wouldBe = sd?.allowed ? "✓ WOULD ALLOW" : "✗ WOULD DENY";
          console.log(`\n[shadow] ${wouldBe}`);
          printKv({
            requestId: data.requestId,
            reason: sd?.reason ?? data.reason,
            risk: sd?.risk ?? data.risk,
            mode: "shadow (not enforced)"
          });
          console.log("");
          return;
        }

        console.log(`\n${data.allowed ? "✓ ALLOWED" : "✗ DENIED"}`);
        printKv({ requestId: data.requestId, reason: data.reason, risk: data.risk });
        console.log("");

        if (!data.allowed) process.exit(1);
      })
    );
}
