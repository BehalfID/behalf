/**
 * Safely assign a manual internal plan (team, business, enterprise) to a workspace account.
 *
 * Assignable plans are limited to team/business/enterprise because this is an administrative
 * non-Stripe upgrade tool, not a general-purpose billing-state editor. free/pro remain under
 * signup defaults and Stripe webhook control.
 *
 * Usage:
 *   npm run account:set-plan -- --account-id acct_... --plan enterprise --dry-run
 *   npm run account:set-plan -- --account-id acct_... --plan enterprise --confirm
 *   npm run account:set-plan -- --account-id acct_... --plan enterprise --confirm --force
 */

import { config } from "dotenv";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import Account from "@/models/Account";
import {
  canRunAccountPlanOverride,
  createAuditEntry,
  formatAuditEntry,
  buildPlanUpdate,
  parseSetAccountPlanArgs,
  STRIPE_WEBHOOK_OVERWRITE_WARNING,
  validatePlanChange,
  accountIsStripeLinked,
  type AccountPlanSnapshot,
  type SetAccountPlanEnv
} from "./set-account-plan-helpers";

config({ path: ".env.local" });
config();

function readEnv(): SetAccountPlanEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_ACCOUNT_PLAN_OVERRIDE: process.env.ALLOW_ACCOUNT_PLAN_OVERRIDE,
    MONGODB_URI: process.env.MONGODB_URI,
    OPERATOR: process.env.OPERATOR
  };
}

function toSnapshot(account: {
  accountId: string;
  name: string;
  plan: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
}): AccountPlanSnapshot {
  return {
    accountId: account.accountId,
    name: account.name,
    plan: account.plan,
    stripeCustomerId: account.stripeCustomerId ?? null,
    stripeSubscriptionId: account.stripeSubscriptionId ?? null,
    stripeSubscriptionStatus: account.stripeSubscriptionStatus ?? null
  };
}

async function main() {
  const env = readEnv();
  const guard = canRunAccountPlanOverride(env);
  if (!guard.allowed) {
    console.error(guard.reason);
    process.exit(1);
  }

  const args = parseSetAccountPlanArgs(process.argv.slice(2));

  try {
    await connectToDatabase();

    const account = await Account.findOne({ accountId: args.accountId })
      .select("accountId name plan stripeCustomerId stripeSubscriptionId stripeSubscriptionStatus")
      .lean();

    if (!account) {
      console.error(`Account not found: ${args.accountId}`);
      process.exit(1);
    }

    const snapshot = toSnapshot(account);
    const validation = validatePlanChange(snapshot, args);
    if (!validation.ok) {
      console.error(validation.reason);
      process.exit(1);
    }

    if (args.dryRun) {
      const audit = createAuditEntry({ args, account: snapshot, applied: false });
      console.log(formatAuditEntry(audit, env.OPERATOR));
      console.log("\nDry run complete. No changes were written.");
      return;
    }

    if (args.force && accountIsStripeLinked(snapshot)) {
      console.warn(STRIPE_WEBHOOK_OVERWRITE_WARNING);
    }

    const update = buildPlanUpdate(args.plan);
    const result = await Account.updateOne({ accountId: args.accountId }, { $set: update });
    if (result.matchedCount !== 1) {
      console.error(`Failed to update account: ${args.accountId}`);
      process.exit(1);
    }

    const audit = createAuditEntry({ args, account: snapshot, applied: true });
    console.log(formatAuditEntry(audit, env.OPERATOR));

    if (args.force && accountIsStripeLinked(snapshot)) {
      console.warn(STRIPE_WEBHOOK_OVERWRITE_WARNING);
    }

    console.log("\nAccount plan updated.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
