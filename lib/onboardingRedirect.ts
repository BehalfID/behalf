import { connectToDatabase } from "@/lib/db";
import { shouldRedirectToAccountSetup } from "@/lib/onboarding";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import DeveloperUser from "@/models/DeveloperUser";

export async function shouldForceAccountSetup(userId: string): Promise<boolean> {
  await connectToDatabase();
  const user = await DeveloperUser.findOne({ userId })
    .select("onboardingCompletedAt createdAt primaryAccountId")
    .lean();
  if (!user) return false;

  const account = user.primaryAccountId
    ? await Account.findOne({ accountId: user.primaryAccountId }).select("verificationCount").lean()
    : null;

  const agentCount = user.primaryAccountId
    ? await Agent.countDocuments({ accountId: user.primaryAccountId })
    : 0;

  return shouldRedirectToAccountSetup({
    onboardingCompletedAt: user.onboardingCompletedAt,
    createdAt: user.createdAt,
    agentCount,
    verificationCount: account?.verificationCount ?? 0
  });
}
