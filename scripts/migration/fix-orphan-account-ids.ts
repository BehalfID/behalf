/**
 * One-off inspect/fix for migration preflight blockers.
 * Run: MONGODB_URI=... npx tsx scripts/migration/fix-orphan-account-ids.ts
 */
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";
import DeveloperUser from "@/models/DeveloperUser";
import AccountMembership from "@/models/AccountMembership";

async function main() {
  await connectToDatabase();

  const agent = await Agent.findOne({ agentId: "agent_BoHkIuD9YGR4zFfP" }).lean();
  const perm = await Permission.findOne({ permissionId: "perm_G5_nFoOxELJj800v" }).lean();

  console.log("--- agent ---");
  console.log(
    JSON.stringify(
      {
        agentId: agent?.agentId,
        accountId: agent?.accountId,
        developerUserId: agent?.developerUserId,
        name: agent?.name,
        status: agent?.status
      },
      null,
      2
    )
  );

  console.log("--- permission ---");
  console.log(
    JSON.stringify(
      {
        permissionId: perm?.permissionId,
        accountId: perm?.accountId,
        agentId: perm?.agentId,
        developerUserId: perm?.developerUserId,
        action: perm?.action,
        status: perm?.status
      },
      null,
      2
    )
  );

  const userId = agent?.developerUserId ?? perm?.developerUserId;
  if (userId) {
    const user = await DeveloperUser.findOne({ userId }).lean();
    const memberships = await AccountMembership.find({ userId }).lean();
    console.log("--- owner context ---");
    console.log(
      JSON.stringify(
        {
          userId,
          primaryAccountId: user?.primaryAccountId,
          memberships: memberships.map((m) => ({
            accountId: m.accountId,
            role: m.role
          }))
        },
        null,
        2
      )
    );
  }

  const apply = process.argv.includes("--apply");
  if (apply) {
    let accountId =
      (await DeveloperUser.findOne({
        userId: agent?.developerUserId ?? perm?.developerUserId
      }).lean())?.primaryAccountId ??
      (
        await AccountMembership.findOne({
          userId: agent?.developerUserId ?? perm?.developerUserId
        }).lean()
      )?.accountId;

    if (!accountId) {
      const { default: Account } = await import("@/models/Account");
      const only = await Account.findOne({}).select("accountId").lean();
      accountId = only?.accountId;
    }

    if (!accountId) {
      throw new Error("Could not resolve accountId for orphan rows.");
    }

    if (agent && !agent.accountId) {
      await Agent.updateOne({ agentId: agent.agentId }, { $set: { accountId } });
      console.log(`Updated agent ${agent.agentId} → accountId=${accountId}`);
    }
    if (perm && !perm.accountId) {
      // Prefer the agent's account after agent backfill
      const linkedAgent = await Agent.findOne({ agentId: perm.agentId }).lean();
      const permAccountId = linkedAgent?.accountId ?? accountId;
      await Permission.updateOne(
        { permissionId: perm.permissionId },
        { $set: { accountId: permAccountId } }
      );
      console.log(`Updated permission ${perm.permissionId} → accountId=${permAccountId}`);
    }
  } else {
    console.log("\nDry run only. Re-run with --apply to write accountId.");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
