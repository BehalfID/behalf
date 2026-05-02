import { BehalfID } from "@behalfid/sdk";

const baseUrl = process.env.BEHALFID_BASE_URL || "http://localhost:3000";
const setupToken = process.env.BEHALFID_SETUP_TOKEN;

async function main() {
  const provisioning = new BehalfID({
    apiKey: setupToken || "public-agent-creation",
    baseUrl
  });

  const agent = await provisioning.createAgent(`SDK Demo Agent ${Date.now()}`);
  const behalf = new BehalfID({
    apiKey: agent.apiKey,
    baseUrl
  });

  await behalf.createPermission({
    agentId: agent.agentId,
    action: "purchase",
    constraints: {
      maxAmount: 800,
      allowedVendors: ["coachella.com"],
      expiresAt: "2099-05-01T23:59:59Z"
    }
  });

  const allowed = await behalf.verify({
    agentId: agent.agentId,
    action: "purchase",
    amount: 742,
    vendor: "coachella.com"
  });

  const denied = await behalf.verify({
    agentId: agent.agentId,
    action: "purchase",
    amount: 1200,
    vendor: "coachella.com"
  });

  console.log(allowed.allowed ? "✓ Allowed: purchase approved" : `✗ Denied: ${allowed.reason}`);
  console.log(denied.allowed ? "✓ Allowed: purchase approved" : `✗ Denied: ${denied.reason}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  if (message.includes("Agent creation is disabled")) {
    console.error("Set BEHALFID_SETUP_TOKEN or enable BEHALFID_PUBLIC_AGENT_CREATION=true locally.");
  }
  process.exit(1);
});
