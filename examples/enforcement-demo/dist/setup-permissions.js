import { BehalfID } from "@behalfid/sdk";
import { readDemoEnv } from "./env.js";
const permissions = [
    {
        agentId: "",
        action: "browse_web",
        description: "Allow safe public web research through the Action Gateway.",
        resource: "web",
        scope: "Read public web pages only.",
        allowedActions: ["browse_web"],
        blockedActions: ["purchase", "checkout", "send_email", "submit_form"],
        requiresApproval: false,
        template: "custom"
    },
    {
        agentId: "",
        action: "purchase",
        description: "Allow small purchases from the example store.",
        resource: "example-store.com",
        scope: "Purchases at example-store.com up to $25.",
        allowedActions: ["purchase"],
        blockedActions: ["checkout_without_verification"],
        requiresApproval: false,
        template: "purchase",
        constraints: {
            maxAmount: 25,
            allowedVendors: ["example-store.com"]
        }
    },
    {
        agentId: "",
        action: "read_email",
        description: "Read-only Gmail access with email sending explicitly blocked.",
        resource: "gmail.com",
        scope: "Read Gmail labels and summaries only.",
        allowedActions: ["read_email"],
        blockedActions: ["send_email"],
        requiresApproval: false,
        template: "access_data",
        constraints: {
            allowedVendors: ["gmail.com"]
        }
    },
    {
        agentId: "",
        action: "renew_subscription",
        description: "Subscription renewals require human approval before execution.",
        resource: "example-store.com",
        scope: "Subscription renewal requests under $25.",
        allowedActions: ["renew_subscription"],
        requiresApproval: true,
        template: "purchase",
        constraints: {
            maxAmount: 25,
            allowedVendors: ["example-store.com"]
        }
    }
];
async function main() {
    const env = readDemoEnv();
    const behalf = new BehalfID({
        apiKey: env.apiKey,
        baseUrl: env.baseUrl,
        allowInsecureHttp: env.allowInsecureHttp
    });
    console.log("Creating demo permissions");
    console.log(`Agent:    ${env.agentId}`);
    console.log(`Instance: ${env.baseUrl}`);
    console.log("");
    for (const permission of permissions) {
        const response = await behalf.createPermission({ ...permission, agentId: env.agentId });
        console.log(`created ${response.permissionId} (${permission.action})`);
    }
    console.log("");
    console.log("Setup complete. Run `npm run demo` from examples/enforcement-demo.");
    console.log("No deploy_production permission was created; that scenario should fail closed.");
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nSetup failed:\n${message}`);
    process.exit(1);
});
