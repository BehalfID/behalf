/**
 * Grant, revoke or inspect a complimentary plan.
 *
 * This is the sanctioned production tool for comping a workspace, and it is
 * deliberately different from `scripts/set-account-plan.ts`:
 *
 *   - `set-account-plan` writes `account.plan`, which Stripe webhooks own and
 *     overwrite; it prints a warning saying exactly that.
 *   - this writes the complimentary columns Stripe never touches, and records an
 *     append-only ledger entry for every change.
 *
 * It is backend-neutral: reads and writes go through the repository facades, so
 * it follows BEHALFID_REPOSITORY_BACKEND like the app does.
 *
 * Usage:
 *   npm run plan:comp -- status --account-id acct_...
 *   npm run plan:comp -- grant --account-id acct_... --plan pro \
 *       --reason "Early tester" --expires lifetime --dry-run
 *   npm run plan:comp -- grant --account-id acct_... --plan pro \
 *       --reason "Early tester" --expires lifetime --confirm
 *   npm run plan:comp -- revoke --account-id acct_... --reason "Converted to paid" --confirm
 *
 * The actor is taken from --actor or $OPERATOR and is recorded in the ledger.
 */

import { config } from "dotenv";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import {
  ComplimentaryPlanError,
  getComplimentaryPlanStatus,
  grantComplimentaryPlan,
  revokeComplimentaryPlan
} from "@/lib/complimentaryPlans";
import { billingPlan, effectivePlan, planEntitlementRegressions } from "@/lib/planGrants";
import { resolveRepositoryBackendFor } from "@/lib/repositories/backend";
import { findAccountById } from "@/lib/repositories/accounts";
import {
  formatExpiry,
  formatStatus,
  parseComplimentaryPlanArgs,
  type ComplimentaryPlanArgs
} from "./complimentary-plan-helpers";

config({ path: ".env.local" });
config();

function resolveActor(args: ComplimentaryPlanArgs): string {
  const actor = args.actor?.trim() || process.env.OPERATOR?.trim();
  if (!actor) {
    throw new Error(
      "An actor is required. Pass --actor or set OPERATOR so the ledger records who authorized this."
    );
  }
  return actor;
}

async function connectIfMongo() {
  // The Postgres path builds its own pool lazily inside the facade; only the
  // Mongo path needs an explicit connection opened and closed here.
  if (resolveRepositoryBackendFor("accounts") !== "mongo") return false;
  await connectToDatabase();
  return true;
}

async function runStatus(args: ComplimentaryPlanArgs) {
  const status = await getComplimentaryPlanStatus(args.accountId);
  console.log(formatStatus(status));
}

async function runGrant(args: ComplimentaryPlanArgs) {
  const actor = resolveActor(args);
  const plan = args.plan!;
  const reason = args.reason!;

  const account = await findAccountById(args.accountId);
  if (!account) throw new Error(`Account not found: ${args.accountId}`);

  const billing = billingPlan(account);
  const before = effectivePlan(account);
  const regressions = planEntitlementRegressions(billing, plan);

  console.log("Complimentary plan grant");
  console.log(`  accountId:     ${args.accountId}`);
  console.log(`  accountName:   ${account.name}`);
  console.log(`  billingPlan:   ${billing}`);
  console.log(`  currentEffective: ${before}`);
  console.log(`  grantPlan:     ${plan}`);
  console.log(`  expires:       ${formatExpiry(args.expiresAt)}`);
  console.log(`  reason:        ${reason}`);
  console.log(`  actor:         ${actor}`);

  if (regressions.length) {
    console.warn(
      `  note: ${plan} rates lower than ${billing} on: ${regressions.join(", ")}. ` +
        "Nothing is lost — entitlements resolve to the per-field maximum — but the granted tier is not uniformly higher."
    );
  }

  if (args.dryRun) {
    console.log("\nDry run complete. No changes were written.");
    return;
  }

  const change = await grantComplimentaryPlan({
    accountId: args.accountId,
    plan,
    reason,
    expiresAt: args.expiresAt,
    actor,
    actorType: "operator_script"
  });

  console.log(`\nGranted. Ledger entry ${change.grantId}.`);
  console.log(`  effective plan: ${change.effectivePlanBefore} -> ${change.effectivePlanAfter}`);
  console.log("  Stripe subscription events cannot clear this grant.");
}

async function runRevoke(args: ComplimentaryPlanArgs) {
  const actor = resolveActor(args);
  const reason = args.reason!;
  const status = await getComplimentaryPlanStatus(args.accountId);

  console.log("Complimentary plan revocation");
  console.log(`  accountId:   ${args.accountId}`);
  console.log(`  accountName: ${status.accountName}`);
  console.log(`  currentGrant: ${status.grant ? status.grant.plan : "(none)"}`);
  console.log(`  billingPlan: ${status.billingPlan}`);
  console.log(`  planAfterRevoke: ${status.billingPlan}`);
  console.log(`  reason:      ${reason}`);
  console.log(`  actor:       ${actor}`);

  if (!status.grant) {
    throw new Error(`Account ${args.accountId} has no complimentary plan to revoke.`);
  }

  if (args.dryRun) {
    console.log("\nDry run complete. No changes were written.");
    return;
  }

  const change = await revokeComplimentaryPlan({
    accountId: args.accountId,
    reason,
    actor,
    actorType: "operator_script"
  });

  console.log(`\nRevoked. Ledger entry ${change.grantId}.`);
  console.log(`  effective plan: ${change.effectivePlanBefore} -> ${change.effectivePlanAfter}`);
}

async function main() {
  const args = parseComplimentaryPlanArgs(process.argv.slice(2));
  const connectedMongo = await connectIfMongo();

  try {
    if (args.command === "status") await runStatus(args);
    else if (args.command === "grant") await runGrant(args);
    else await runRevoke(args);
  } finally {
    if (connectedMongo) await mongoose.disconnect();
  }
}

main().catch((error) => {
  if (error instanceof ComplimentaryPlanError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
