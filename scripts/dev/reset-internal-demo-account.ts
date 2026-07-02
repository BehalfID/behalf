/**
 * Reset the internal onboarding demo account for local/dev browser testing.
 *
 * Default behavior clears onboarding state and demo-owned agents, permissions,
 * approvals, logs, and invites so login hard-redirects to /onboarding.
 *
 * Safety: requires a clearly non-production MongoDB database name unless
 * ALLOW_INTERNAL_DEMO_RESET=1 is set.
 *
 * Usage:
 *   INTERNAL_DEMO_PASSWORD='<46+ character secure password>' npm run dev:reset-internal-demo
 *
 * Preserve demo agents/activity (login may not hard-redirect if activity exists):
 *   KEEP_INTERNAL_DEMO_DATA=1 INTERNAL_DEMO_PASSWORD='<password>' npm run dev:reset-internal-demo
 */

import { config } from "dotenv";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { hashPassword } from "@/lib/developerAuth";
import {
  runInternalDemoAccountReset,
  type InternalDemoResetEnv
} from "./reset-internal-demo-account-helpers";

config({ path: ".env.local" });
config();

function readEnv(): InternalDemoResetEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_INTERNAL_DEMO_RESET: process.env.ALLOW_INTERNAL_DEMO_RESET,
    ALLOW_PUBLIC_DEMO_EMAIL: process.env.ALLOW_PUBLIC_DEMO_EMAIL,
    INTERNAL_DEMO_EMAIL: process.env.INTERNAL_DEMO_EMAIL,
    INTERNAL_DEMO_PASSWORD: process.env.INTERNAL_DEMO_PASSWORD,
    KEEP_INTERNAL_DEMO_DATA: process.env.KEEP_INTERNAL_DEMO_DATA,
    MONGODB_URI: process.env.MONGODB_URI
  };
}

function printSummary(result: Awaited<ReturnType<typeof runInternalDemoAccountReset>>) {
  console.log("Internal demo account reset complete.");
  console.log(`  demo email: ${result.email}`);
  console.log(`  user: ${result.userAction}`);
  console.log(`  account: ${result.accountAction}`);
  console.log(`  membership: ${result.membershipAction}`);
  console.log(`  onboarding reset: ${result.onboardingReset ? "yes" : "no"}`);
  console.log(`  demo activity cleared: ${result.demoDataCleared ? "yes" : "no"}`);
  console.log(`  demo activity preserved: ${result.demoDataPreserved ? "yes" : "no"}`);

  if (result.demoDataCleared) {
    console.log("  login redirect: should hard-redirect to /onboarding");
  } else {
    console.warn(
      "  login redirect: demo agents/activity were preserved; login may not hard-redirect to /onboarding if activity exists"
    );
  }

  if (result.passwordGenerated && result.generatedPassword) {
    console.warn(
      "Generated a local/dev-only INTERNAL_DEMO_PASSWORD because none was provided. " +
        "Store it securely outside the repo and export INTERNAL_DEMO_PASSWORD for future runs."
    );
    console.log(`  generated password: ${result.generatedPassword}`);
  }
}

async function main() {
  const env = readEnv();

  try {
    await connectToDatabase();
    const result = await runInternalDemoAccountReset({
      env,
      hashPassword
    });
    printSummary(result);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Internal demo account reset failed: ${message}`);
  process.exitCode = 1;
});
