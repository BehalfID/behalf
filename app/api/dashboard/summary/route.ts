import { type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getDashboardSummary } from "@/lib/dashboardData";
import { noCacheJson } from "@/lib/responses";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const data = await getDashboardSummary(auth.user.userId, auth.account);
  // Include onboardingUseCase so the dashboard HomeView doesn't need a
  // separate /api/auth/me round trip to render the quickstart panel.
  return noCacheJson({
    ...data,
    onboardingUseCase: auth.user.onboardingUseCase ?? null,
    accountOnboarding: auth.account?.onboarding
      ? {
          controlAreas: auth.account.onboarding.controlAreas ?? [],
          firstSetupGoal: auth.account.onboarding.firstSetupGoal ?? null
        }
      : null
  });
}
