import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { hashPassword } from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
import DeveloperUser from "@/models/DeveloperUser";
import AccountMembership from "@/models/AccountMembership";
import { writeFileSync } from "node:fs";

async function main() {
  await connectToDatabase();
  const owner = await DeveloperUser.findOne({ email: "demo+1785194661@example.com" }).lean();
  if (!owner?.primaryAccountId) throw new Error("owner missing");

  const email = `lead+${Date.now()}@example.com`;
  const password = "LeadApproverPassword123!";
  const userId = createPublicId("user");
  await DeveloperUser.create({
    userId,
    email,
    passwordHash: await hashPassword(password),
    authProviders: ["password"],
    dateOfBirth: "1988-05-01",
    emailVerified: true,
    primaryAccountId: owner.primaryAccountId
  });
  await AccountMembership.create({
    membershipId: createPublicId("mem"),
    accountId: owner.primaryAccountId,
    userId,
    role: "ENGINEERING_LEAD",
    status: "active"
  });

  const lead = { email, password, userId, accountId: owner.primaryAccountId };
  writeFileSync("/tmp/demo-lead.json", JSON.stringify(lead, null, 2));
  writeFileSync(
    "/tmp/demo-owner.json",
    JSON.stringify(
      {
        email: owner.email,
        password: "DemoReadyPassword123!",
        userId: owner.userId,
        accountId: owner.primaryAccountId,
        workspaceSlug: "demo-corp",
        agentId: "agent_CMCrB8yWDDsvALeh"
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(lead));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
