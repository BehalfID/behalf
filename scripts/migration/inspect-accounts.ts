import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import Account from "@/models/Account";
import AccountMembership from "@/models/AccountMembership";
import Agent from "@/models/Agent";
import DeveloperUser from "@/models/DeveloperUser";

async function main() {
  await connectToDatabase();
  const user = await DeveloperUser.findOne({ userId: "user_onDO2lYMZOU2_cF8" }).lean();
  const accounts = await Account.find({}).select("accountId name slug plan").lean();
  const membershipCount = await AccountMembership.countDocuments({});
  const agentsMissing = await Agent.countDocuments({
    $or: [{ accountId: null }, { accountId: { $exists: false } }]
  });
  console.log(
    JSON.stringify(
      {
        user: user
          ? {
              userId: user.userId,
              email: user.email,
              primaryAccountId: user.primaryAccountId
            }
          : null,
        accountCount: accounts.length,
        accounts,
        membershipCount,
        agentsMissing
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
