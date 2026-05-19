import { BehalfID } from "@behalfid/sdk";
import { enforceAction, formatDecision } from "./enforcement.js";
import { readDemoEnv } from "./env.js";
function didBlock(error) {
    return error instanceof Error && error.name === "ActionBlockedError" && "decision" in error;
}
async function main() {
    const env = readDemoEnv();
    const behalf = new BehalfID({
        apiKey: env.apiKey,
        baseUrl: env.baseUrl,
        allowInsecureHttp: env.allowInsecureHttp
    });
    const requestIds = [];
    const scenarios = [
        {
            name: "Allowed web research through the Action Gateway",
            input: {
                action: "browse_web",
                resource: "web",
                metadata: { demo: "enforcement-demo", scenario: "allowed_gateway" }
            },
            expected: "allowed",
            executorLabel: "Action Gateway public-web-read executor",
            execute: async () => {
                const result = await behalf.executeAction({
                    agentId: env.agentId,
                    action: "browse_web",
                    resource: "web",
                    input: { url: "https://example.com" }
                });
                if (!result.executed) {
                    throw new Error(`Gateway did not execute: ${result.reason || result.error || "unknown error"}`);
                }
                if (result.requestId)
                    requestIds.push(result.requestId);
                return `executor ran: ${result.result?.title || result.result?.url || "public web read"}`;
            }
        },
        {
            name: "Denied over maxAmount",
            input: {
                action: "purchase",
                vendor: "example-store.com",
                amount: 742,
                metadata: { demo: "enforcement-demo", scenario: "max_amount_denial" }
            },
            expected: "denied",
            executorLabel: "purchase executor",
            execute: async () => "purchase completed"
        },
        {
            name: "Denied blocked action",
            input: {
                action: "send_email",
                vendor: "gmail.com",
                metadata: { demo: "enforcement-demo", scenario: "blocked_action" }
            },
            expected: "denied",
            executorLabel: "email executor",
            execute: async () => "email sent"
        },
        {
            name: "Approval required",
            input: {
                action: "renew_subscription",
                vendor: "example-store.com",
                amount: 24,
                metadata: { demo: "enforcement-demo", scenario: "approval_required" }
            },
            expected: "denied",
            executorLabel: "subscription renewal executor",
            execute: async () => "subscription renewed"
        },
        {
            name: "Denied missing permission",
            input: {
                action: "deploy_production",
                vendor: "github.com",
                metadata: { demo: "enforcement-demo", scenario: "missing_permission" }
            },
            expected: "denied",
            executorLabel: "deployment executor",
            execute: async () => "production deployed"
        }
    ];
    console.log("BehalfID Action Gateway enforcement demo");
    console.log(`Agent:    ${env.agentId}`);
    console.log(`Instance: ${env.baseUrl}`);
    console.log("");
    for (const [index, scenario] of scenarios.entries()) {
        let executorRan = false;
        console.log(`${index + 1}. ${scenario.name}`);
        console.log(`   request: ${scenario.input.action} on ${scenario.input.vendor || scenario.input.resource}`);
        try {
            const output = await enforceAction(behalf, env.agentId, scenario.input, async (decision) => {
                executorRan = true;
                requestIds.push(decision.requestId);
                return scenario.execute(decision);
            });
            console.log(`   decision: allowed`);
            console.log(`   ${scenario.executorLabel}: ${output}`);
        }
        catch (error) {
            if (!didBlock(error))
                throw error;
            requestIds.push(error.decision.requestId);
            console.log(`   decision: ${formatDecision(error.decision)}`);
            console.log(`   ${scenario.executorLabel}: not run`);
        }
        const expectedExecutorState = scenario.expected === "allowed";
        if (executorRan !== expectedExecutorState) {
            throw new Error(`Unexpected executor state for "${scenario.name}": expected ${expectedExecutorState}, got ${executorRan}.`);
        }
        console.log("");
    }
    const logs = await behalf.getLogs(env.agentId);
    const loggedRequestIds = new Set(logs.map((log) => log.requestId));
    const missingLogIds = requestIds.filter((requestId) => !loggedRequestIds.has(requestId));
    console.log("Audit check");
    console.log(`   requestIds observed: ${requestIds.join(", ")}`);
    console.log(`   matching logs found: ${requestIds.length - missingLogIds.length}/${requestIds.length}`);
    if (missingLogIds.length > 0) {
        throw new Error(`Missing audit logs for requestIds: ${missingLogIds.join(", ")}`);
    }
    console.log("");
    console.log("Demo complete.");
    console.log("Denied actions failed closed; their executors did not run.");
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nDemo failed:\n${message}`);
    process.exit(1);
});
