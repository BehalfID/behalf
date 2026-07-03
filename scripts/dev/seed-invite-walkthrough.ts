/**
 * Seed data for invite acceptance + workspace switching browser walkthrough.
 *
 * Usage:
 *   MONGODB_URI=mongodb://127.0.0.1:27018/behalf-dev npx tsx scripts/dev/seed-invite-walkthrough.ts
 */

import { config } from "dotenv";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { createPublicId } from "@/lib/ids";
import { hashPassword } from "@/lib/developerAuth";
import { createInviteTokenPair } from "@/lib/inviteAcceptance";
import Account from "@/models/Account";
import AccountInvite from "@/models/AccountInvite";
import AccountMembership from "@/models/AccountMembership";
import Agent from "@/models/Agent";
import DeveloperUser from "@/models/DeveloperUser";
import { hashApiKey } from "@/lib/auth";
import {
  DEFAULT_INTERNAL_DEMO_EMAIL,
  runInternalDemoAccountReset
} from "./reset-internal-demo-account-helpers";

config({ path: ".env.local" });
config();

const demoPassword = process.env.INTERNAL_DEMO_PASSWORD;
if (!demoPassword) {
  throw new Error("INTERNAL_DEMO_PASSWORD is required to seed the invite walkthrough.");
}
const DEMO_PASSWORD = demoPassword;

const INTERNAL_EMAIL_DOMAIN = DEFAULT_INTERNAL_DEMO_EMAIL.split("@")[1]!;
const INVITED_EMAIL = `invite-walkthrough-test@${INTERNAL_EMAIL_DOMAIN}`;
const WRONG_EMAIL = `invite-walkthrough-wrong@${INTERNAL_EMAIL_DOMAIN}`;
const SECOND_WORKSPACE_NAME = "Walkthrough Secondary Workspace";

async function main() {
  await connectToDatabase();

  await runInternalDemoAccountReset({
    env: {
      NODE_ENV: "development",
      INTERNAL_DEMO_PASSWORD: DEMO_PASSWORD,
      MONGODB_URI: process.env.MONGODB_URI,
      ALLOW_INTERNAL_DEMO_RESET: "1"
    },
    hashPassword
  });

  const owner = await DeveloperUser.findOne({ email: DEFAULT_INTERNAL_DEMO_EMAIL }).lean();
  if (!owner?.primaryAccountId) {
    throw new Error("Demo owner not found after reset.");
  }

  await DeveloperUser.updateOne(
    { userId: owner.userId },
    {
      $set: {
        onboardingCompletedAt: new Date(),
        firstName: "Demo",
        lastName: "Owner",
        emailVerified: true
      }
    }
  );

  await Account.updateOne(
    { accountId: owner.primaryAccountId },
    {
      $set: {
        name: "Walkthrough Primary Workspace",
        accountType: "company",
        companyName: "Walkthrough Co",
        teamSize: "2-10"
      }
    }
  );

  const secondaryAccountId = createPublicId("acct");
  await Account.create({
    accountId: secondaryAccountId,
    name: SECOND_WORKSPACE_NAME
  });
  await AccountMembership.create({
    membershipId: createPublicId("mbr"),
    accountId: secondaryAccountId,
    userId: owner.userId,
    role: "OWNER"
  });

  await Agent.create({
    agentId: createPublicId("agent"),
    accountId: owner.primaryAccountId,
    developerUserId: owner.userId,
    name: "Primary Workspace Agent",
    apiKeyHash: hashApiKey("bhf_sk_walkthrough_primary_agent_key_abcdefghijklmnopqrstuvwxyz")
  });

  await Agent.create({
    agentId: createPublicId("agent"),
    accountId: secondaryAccountId,
    developerUserId: owner.userId,
    name: "Secondary Workspace Agent",
    apiKeyHash: hashApiKey("bhf_sk_walkthrough_secondary_agent_key_abcdefghijklmnopqr")
  });

  const { token, tokenHash, expiresAt } = createInviteTokenPair();
  const invite = await AccountInvite.create({
    inviteId: createPublicId("inv"),
    accountId: owner.primaryAccountId,
    email: INVITED_EMAIL,
    role: "ENGINEER",
    status: "pending",
    invitedBy: owner.userId,
    inviteTokenHash: tokenHash,
    inviteTokenExpiresAt: expiresAt
  });

  const invitedPasswordHash = await hashPassword(DEMO_PASSWORD);
  let invitedUser = await DeveloperUser.findOne({ email: INVITED_EMAIL }).lean();
  if (!invitedUser) {
    const invitedAccountId = createPublicId("acct");
    const invitedUserId = createPublicId("user");
    await DeveloperUser.create({
      userId: invitedUserId,
      email: INVITED_EMAIL,
      passwordHash: invitedPasswordHash,
      primaryAccountId: invitedAccountId,
      emailVerified: true,
      onboardingCompletedAt: new Date(),
      firstName: "Invited",
      lastName: "User"
    });
    invitedUser = await DeveloperUser.findOne({ email: INVITED_EMAIL }).lean();
    await Account.create({
      accountId: invitedAccountId,
      name: "Invited User Personal Workspace"
    });
    await AccountMembership.create({
      membershipId: createPublicId("mbr"),
      accountId: invitedAccountId,
      userId: invitedUserId,
      role: "OWNER"
    });
  } else {
    await DeveloperUser.updateOne(
      { userId: invitedUser.userId },
      {
        $set: {
          passwordHash: invitedPasswordHash,
          emailVerified: true,
          onboardingCompletedAt: new Date(),
          firstName: "Invited",
          lastName: "User"
        }
      }
    );
  }

  let wrongUser = await DeveloperUser.findOne({ email: WRONG_EMAIL }).lean();
  const wrongPasswordHash = await hashPassword(DEMO_PASSWORD);
  if (!wrongUser) {
    const wrongAccountId = createPublicId("acct");
    const wrongUserId = createPublicId("user");
    await DeveloperUser.create({
      userId: wrongUserId,
      email: WRONG_EMAIL,
      passwordHash: wrongPasswordHash,
      primaryAccountId: wrongAccountId,
      emailVerified: true,
      onboardingCompletedAt: new Date(),
      firstName: "Wrong",
      lastName: "Email"
    });
    wrongUser = await DeveloperUser.findOne({ email: WRONG_EMAIL }).lean();
    await Account.create({
      accountId: wrongAccountId,
      name: "Wrong Email Workspace"
    });
    await AccountMembership.create({
      membershipId: createPublicId("mbr"),
      accountId: wrongAccountId,
      userId: wrongUserId,
      role: "OWNER"
    });
  } else {
    await DeveloperUser.updateOne(
      { userId: wrongUser.userId },
      {
        $set: {
          passwordHash: wrongPasswordHash,
          emailVerified: true,
          onboardingCompletedAt: new Date(),
          firstName: "Wrong",
          lastName: "Email"
        }
      }
    );
  }

  console.log("Invite walkthrough seed complete.");
  console.log(`  owner email: ${DEFAULT_INTERNAL_DEMO_EMAIL}`);
  console.log(`  owner password: ${DEMO_PASSWORD}`);
  console.log(`  invited email: ${INVITED_EMAIL}`);
  console.log(`  invited password: ${DEMO_PASSWORD}`);
  console.log(`  wrong-email user: ${WRONG_EMAIL}`);
  console.log(`  invite token: ${token}`);
  console.log(`  invite path: /invite/${encodeURIComponent(token)}`);
  console.log(`  invite id (revoke): ${invite.inviteId}`);
  console.log(`  primary workspace: Walkthrough Primary Workspace`);
  console.log(`  secondary workspace: ${SECOND_WORKSPACE_NAME}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
