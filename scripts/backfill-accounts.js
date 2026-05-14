#!/usr/bin/env node
/**
 * One-time migration: creates one Account per DeveloperUser that lacks a primaryAccountId,
 * sets primaryAccountId on the user, and reassigns that user's agents to the new account.
 *
 * Usage:
 *   MONGODB_URI=mongodb://... node scripts/backfill-accounts.js
 *
 * Safe to re-run — skips developers who already have primaryAccountId.
 */

import mongoose from "mongoose";
import crypto from "crypto";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI environment variable is required.");
  process.exit(1);
}

function createPublicId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  const db = mongoose.connection.db;
  const users = db.collection("developerusers");
  const accounts = db.collection("accounts");
  const agents = db.collection("agents");

  const unlinked = await users.find({ primaryAccountId: { $exists: false } }).toArray();
  console.log(`Found ${unlinked.length} developer(s) without a primaryAccountId.`);

  let created = 0;
  for (const user of unlinked) {
    const name = (user.email?.split("@")[0] ?? user.email ?? "developer").trim();
    const accountId = createPublicId("acct");
    const now = new Date();

    await accounts.insertOne({
      accountId,
      name,
      plan: "free",
      verificationCount: 0,
      verificationPeriodStart: now,
      createdAt: now,
      updatedAt: now
    });

    await users.updateOne(
      { _id: user._id },
      { $set: { primaryAccountId: accountId, updatedAt: now } }
    );

    // Reassign agents that belong to this developer but are still on the default account
    const result = await agents.updateMany(
      { developerUserId: user.userId, accountId: { $ne: accountId } },
      { $set: { accountId, updatedAt: now } }
    );

    console.log(`  user ${user.userId} (${user.email}) → account ${accountId} (${result.modifiedCount} agents reassigned)`);
    created++;
  }

  console.log(`Done. Created ${created} account(s).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
