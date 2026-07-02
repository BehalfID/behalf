import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import type { Plan } from "@/lib/plans";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import { BillingClient } from "./client";

export const metadata = { title: "Billing — BehalfID" };

export default async function BillingPage() {
  const user = await getCurrentDeveloper();
  if (!user) redirect("/login");
  if (await shouldForceAccountSetup(user.userId)) redirect("/onboarding");

  await connectToDatabase();

  const account = user.primaryAccountId
    ? await Account.findOne({ accountId: user.primaryAccountId }).lean()
    : null;

  const [agentCount] = await Promise.all([
    Agent.countDocuments({ developerUserId: user.userId })
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
