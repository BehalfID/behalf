import { connectToDatabase } from "@/lib/db";
import { cache } from "react";
import {
  ACCOUNT_SETUP_LAUNCH,
  needsOnboardingBanner,
  shouldRedirectToAccountSetup
} from "@/lib/onboarding";
import Account from "@/models/Account";
import Agent from "@/models/Agent";
import DeveloperUser from "@/models/DeveloperUser";

export { ACCOUNT_SETUP_LAUNCH };

export type OnboardingRedirectContext = {
  onboardingCompletedAt?: Date | string | null;
  createdAt?: Date | string | null;
  agentCount: number;
  verificationCount: number;
};

async function loadOnboardingRedirectContext(
  userId: string
): Promise<OnboardingRedirectContext | null> {
  await connectToDatabase();
  const user = await DeveloperUser.findOne({ userId })
    .select("onboardingCompletedAt createdAt primaryAccountId")
    .lean();
  if (!user) return null;

  const [account, agentCount] = await Promise.all([
    user.primaryAccountId
      ? Account.findOne({ accountId: user.primaryAccountId })
          .select("verificationCount")
          .lean()
      : Promise.resolve(null),
    user.primaryAccountId
      ? Agent.countDocuments({ accountId: user.primaryAccountId })
      : Promise.resolve(0)
  ]);

  return {
    onboardingCompletedAt: user.onboardingCompletedAt,
    createdAt: user.createdAt,
    agentCount,
    verificationCount: account?.verificationCount ?? 0
  };
}

/** Shared only by repeated consumers in one Server Component render. */
export const getOnboardingRedirectContext = cache(loadOnboardingRedirectContext);

/** Hard redirect only for brand-new post-launch accounts without prior activity. */
export function shouldForceAccountSetupFromContext(context: OnboardingRedirectContext): boolean {
  return shouldRedirectToAccountSetup(context);
}

/** Soft prompt for legacy or active accounts that never completed setup. */
export function shouldShowAccountSetupBanner(context: OnboardingRedirectContext): boolean {
  if (shouldForceAccountSetupFromContext(context)) return false;
  return needsOnboardingBanner(context.onboardingCompletedAt);
}

export async function shouldForceAccountSetup(userId: string): Promise<boolean> {
  const context = await getOnboardingRedirectContext(userId);
  if (!context) return false;
  return shouldForceAccountSetupFromContext(context);
}

export async function shouldShowAccountSetupBannerForUser(userId: string): Promise<boolean> {
  const context = await getOnboardingRedirectContext(userId);
  if (!context) return false;
  return shouldShowAccountSetupBanner(context);
}
