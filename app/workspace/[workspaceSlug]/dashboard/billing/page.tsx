import { notFound, redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { getCurrentDeveloperContext } from "@/lib/developerAuth";
import { requireWorkspaceMembershipBySlug } from "@/lib/accountContext";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import { normalizePlan } from "@/lib/plans";
import { countBillableSeats } from "@/lib/quota";
import { validateWorkspaceSlug } from "@/lib/workspaceSlug";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import ManagedProfilePolicy from "@/models/ManagedProfilePolicy";
import { BillingClient } from "@/app/dashboard/billing/client";

export const metadata = { title: "Billing — BehalfID" };

export default async function WorkspaceBillingPage({
  params
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug: rawSlug } = await params;
  const workspaceSlug = rawSlug.trim().toLowerCase();
  if (validateWorkspaceSlug(workspaceSlug) !== null) notFound();

  const context = await getCurrentDeveloperContext();
  const user = context?.user;
  if (!user) redirect(`/login?next=/${workspaceSlug}/dashboard/billing`);
  if (await shouldForceAccountSetup(user.userId)) redirect("/onboarding");

  // Layout already verified membership; re-resolve for accountId tenancy.
  const resolved = await requireWorkspaceMembershipBySlug(user.userId, workspaceSlug);
  if ("error" in resolved) notFound();

  await connectToDatabase();

  const accountId = resolved.workspace.accountId;
  const account = await Account.findOne({ accountId }).lean();

  const [agentCount, seatCount, policy] = await Promise.all([
    Agent.countDocuments({ accountId }),
    countBillableSeats(accountId),
    ManagedProfilePolicy.findOne({ accountId }).select("protectedRepos").lean()
  ]);

  return (
    <BillingClient
      plan={normalizePlan(account?.plan)}
      stripeSubscriptionStatus={account?.stripeSubscriptionStatus ?? null}
      stripeTrialEnd={account?.stripeTrialEnd ? new Date(account.stripeTrialEnd).toISOString() : null}
      stripeCurrentPeriodEnd={
        account?.stripeCurrentPeriodEnd
          ? new Date(account.stripeCurrentPeriodEnd).toISOString()
          : null
      }
      agentCount={agentCount}
      seatCount={seatCount}
      protectedRepoCount={policy?.protectedRepos?.length ?? 0}
      verificationCount={account?.verificationCount ?? 0}
      verificationPeriodStart={(account?.verificationPeriodStart ?? new Date()).toISOString()}
      embedded
    />
  );
}
