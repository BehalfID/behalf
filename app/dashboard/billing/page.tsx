import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { getCurrentDeveloperContext } from "@/lib/developerAuth";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import type { Plan } from "@/lib/plans";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import { BillingClient } from "./client";

export const metadata = { title: "Billing — BehalfID" };

export default async function BillingPage() {
  const context = await getCurrentDeveloperContext();
  const user = context?.user;
  if (!user) redirect("/login");
  if (await shouldForceAccountSetup(user.userId)) redirect("/onboarding");

  await connectToDatabase();

  const accountId = context?.activeAccountId ?? user.primaryAccountId;
  const account = accountId
    ? await Account.findOne({ accountId }).lean()
    : null;

  const [agentCount] = await Promise.all([
    accountId ? Agent.countDocuments({ accountId }) : Agent.countDocuments({ developerUserId: user.userId })
  ]);

  return (
    <BillingClient
      plan={(account?.plan ?? "free") as Plan}
      stripeSubscriptionStatus={account?.stripeSubscriptionStatus ?? null}
      stripeTrialEnd={account?.stripeTrialEnd ? new Date(account.stripeTrialEnd).toISOString() : null}
      stripeCurrentPeriodEnd={account?.stripeCurrentPeriodEnd ? new Date(account.stripeCurrentPeriodEnd).toISOString() : null}
      agentCount={agentCount}
      verificationCount={account?.verificationCount ?? 0}
      verificationPeriodStart={(account?.verificationPeriodStart ?? new Date()).toISOString()}
    />
  );
}
