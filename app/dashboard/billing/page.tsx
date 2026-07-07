import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { getCurrentDeveloperContext } from "@/lib/developerAuth";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import { normalizePlan } from "@/lib/plans";
import { countBillableSeats } from "@/lib/quota";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import ManagedProfilePolicy from "@/models/ManagedProfilePolicy";
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

  const [agentCount, seatCount, policy] = await Promise.all([
    accountId ? Agent.countDocuments({ accountId }) : Agent.countDocuments({ developerUserId: user.userId }),
    accountId ? countBillableSeats(accountId) : Promise.resolve(0),
    accountId
      ? ManagedProfilePolicy.findOne({ accountId }).select("protectedRepos").lean()
      : Promise.resolve(null)
  ]);

  return (
    <BillingClient
      plan={normalizePlan(account?.plan)}
      stripeSubscriptionStatus={account?.stripeSubscriptionStatus ?? null}
      stripeTrialEnd={account?.stripeTrialEnd ? new Date(account.stripeTrialEnd).toISOString() : null}
      stripeCurrentPeriodEnd={account?.stripeCurrentPeriodEnd ? new Date(account.stripeCurrentPeriodEnd).toISOString() : null}
      agentCount={agentCount}
      seatCount={seatCount}
      protectedRepoCount={policy?.protectedRepos?.length ?? 0}
      verificationCount={account?.verificationCount ?? 0}
      verificationPeriodStart={(account?.verificationPeriodStart ?? new Date()).toISOString()}
    />
  );
}
