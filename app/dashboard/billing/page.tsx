import { redirect } from "next/navigation";
import { getCurrentDeveloperContext } from "@/lib/developerAuth";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import { workspaceDashboardHref } from "@/lib/workspaceSlug";
import { ensureAccountHasSlug } from "@/lib/workspaceSlugServer";
import { findAccountByIdLean, findOneAccount } from "@/lib/repositories/accounts";
import { countAgents } from "@/lib/repositories/agents";
import { findManagedProfilePolicyByAccountId } from "@/lib/repositories/managedProfiles";
import { complimentaryBadge, effectivePlan } from "@/lib/planGrants";
import { countBillableSeats } from "@/lib/quota";
import { BillingClient } from "./client";

export const metadata = { title: "Billing — BehalfID" };

export default async function BillingPage() {
  const context = await getCurrentDeveloperContext();
  const user = context?.user;
  if (!user) redirect("/login");
  if (await shouldForceAccountSetup(user.userId)) redirect("/onboarding");

  const accountId = context?.activeAccountId ?? user.primaryAccountId;
  if (accountId) {
    const account = await findAccountByIdLean(accountId, "accountId slug name companyName");
    let slug = account?.slug?.trim().toLowerCase() || null;
    if (!slug) slug = await ensureAccountHasSlug(accountId);
    if (slug) redirect(workspaceDashboardHref(slug, "/billing"));
  }

  const account = accountId ? await findOneAccount({ accountId }) : null;

  const [agentCount, seatCount, policy] = await Promise.all([
    accountId
      ? countAgents({ accountId })
      : countAgents({ developerUserId: user.userId }),
    accountId ? countBillableSeats(accountId) : Promise.resolve(0),
    accountId ? findManagedProfilePolicyByAccountId(accountId) : Promise.resolve(null)
  ]);

  return (
    <BillingClient
      plan={effectivePlan(account)}
      complimentary={complimentaryBadge(account)}
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
