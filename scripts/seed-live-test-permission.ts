/**
 * Seed the test permission required for live adapter allowed-path tests.
 *
 * Creates:
 *   action:   "send"
 *   resource: "communication.email"
 *   expiry:   1 hour from now (auto-cleans itself)
 *
 * Safe to rerun: if the permission already exists and verify returns allowed,
 * the script exits 0 without creating a duplicate.
 *
 * Usage:
 *   npm run seed:live-test
 *   # or: tsx scripts/seed-live-test-permission.ts
 *
 * Required env vars (loaded from ~/behalf/.env if not already set):
 *   BEHALFID_BASE_URL
 *   BEHALFID_API_KEY
 *   BEHALFID_AGENT_ID
 */

import { loadLocalEnv } from "../test/helpers/load-local-env";
import { ensureLiveTestPermission, ALLOWED_ACTION, ALLOWED_RESOURCE } from "../test/helpers/live-test-setup";

loadLocalEnv();

const REQUIRED = ["BEHALFID_BASE_URL", "BEHALFID_API_KEY", "BEHALFID_AGENT_ID"] as const;

const missing = REQUIRED.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`[seed] Missing required env vars: ${missing.join(", ")}`);
  console.error("[seed] Add them to ~/behalf/.env or export them before running.");
  process.exit(1);
}

console.log(`[seed] Checking/creating test permission:`);
console.log(`       action:   "${ALLOWED_ACTION}"`);
console.log(`       resource: "${ALLOWED_RESOURCE}"`);
console.log(`       base URL: ${process.env.BEHALFID_BASE_URL}`);
console.log(`       agent:    ${process.env.BEHALFID_AGENT_ID}`);
console.log("");

const result = await ensureLiveTestPermission();

if (result.canRunAllowedTests) {
  if (result.seededPermissionId) {
    console.log(`[seed] Created new permission: ${result.seededPermissionId}`);
    console.log(`[seed] Expires in 1 hour (auto-cleanup).`);
    console.log(`[seed] To remove early: dashboard → Agent → Permissions → Revoke`);
  } else {
    console.log(`[seed] Permission already active — no action needed.`);
  }
  console.log(`[seed] OK: allowed-path live tests can now run.`);
  process.exit(0);
} else {
  console.error(`[seed] FAILED: ${result.reason}`);
  console.error("");
  console.error("[seed] Manual steps:");
  console.error(`  1. Open your BehalfID dashboard`);
  console.error(`  2. Go to Agents → ${process.env.BEHALFID_AGENT_ID} → Permissions`);
  console.error(`  3. Create permission:`);
  console.error(`       action:   "${ALLOWED_ACTION}"`);
  console.error(`       resource: "${ALLOWED_RESOURCE}"`);
  console.error(`  4. Rerun: npm run seed:live-test`);
  process.exit(1);
}
