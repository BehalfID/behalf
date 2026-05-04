import { BehalfID } from "@behalfid/sdk";

const apiKey = process.env.BEHALFID_API_KEY;
const agentId = process.env.BEHALFID_AGENT_ID;
const baseUrl = process.env.BEHALFID_BASE_URL || "https://behalfid.vercel.app";

if (!apiKey || !agentId) {
  console.error("Missing required environment variables.");
  console.error("  BEHALFID_API_KEY  — agent API key (shown once at creation)");
  console.error("  BEHALFID_AGENT_ID — agent ID from /dashboard/agents");
  console.error("\nCopy .env.example to .env and fill in your credentials.");
  process.exit(1);
}

const behalf = new BehalfID({ apiKey, baseUrl });

/**
 * Enforce a BehalfID permission check before an action proceeds.
 *
 * If BehalfID denies the action, this function throws — the caller
 * never reaches the code that would have executed the action.
 * This is the "fail closed" pattern: on denial, the safe default is
 * to stop rather than proceed.
 */
async function enforceAction(input) {
  const result = await behalf.verify({ agentId, ...input });
  if (!result.allowed) {
    throw new Error(`Action blocked by BehalfID: ${result.reason}`);
  }
  return result;
}

async function main() {
  console.log("BehalfID enforcement demo");
  console.log(`Agent:    ${agentId}`);
  console.log(`Instance: ${baseUrl}`);
  console.log("");

  // --- 1. access_data on gmail.com ---
  // Expected: allowed (requires an active access_data permission on gmail.com)
  console.log("1. access_data on gmail.com");
  try {
    await enforceAction({ action: "access_data", vendor: "gmail.com" });
    // This line only runs if BehalfID allows the action.
    console.log("   ✓ Allowed — proceeding: reading email labels...");
  } catch (err) {
    console.log(`   ✗ Blocked — ${err.message}`);
    console.log("   The agent did not read email.");
  }

  console.log("");

  // --- 2. send_email on gmail.com ---
  // Expected: denied — no permission covers send_email
  console.log("2. send_email on gmail.com");
  try {
    await enforceAction({ action: "send_email", vendor: "gmail.com" });
    // BehalfID denied the action, so this line never runs.
    console.log("   Sending email... (this line never runs when denied)");
  } catch (err) {
    console.log(`   ✗ Blocked — ${err.message}`);
    console.log("   The agent did not send the email.");
  }

  console.log("");

  // --- 3. purchase on coachella.com ---
  // Expected: denied — no purchase permission exists (unless you added one)
  console.log("3. purchase on coachella.com ($742)");
  try {
    await enforceAction({ action: "purchase", vendor: "coachella.com", amount: 742 });
    // BehalfID denied the action, so this line never runs.
    console.log("   Completing purchase... (this line never runs when denied)");
  } catch (err) {
    console.log(`   ✗ Blocked — ${err.message}`);
    console.log("   The agent did not complete the purchase.");
  }

  console.log("");
  console.log("Demo complete.");
  console.log("Denied actions failed closed — the agent never reached those lines.");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nFatal: ${message}`);
  process.exit(1);
});
