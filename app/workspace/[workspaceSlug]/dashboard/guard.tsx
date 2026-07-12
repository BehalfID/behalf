import { shouldShowAccountSetupBannerForUser } from "@/lib/onboardingRedirect";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { DashboardViews } from "@/app/dashboard/client";

export async function WorkspaceProtectedDashboard({
  view,
  id
}: {
  view:
    | "home"
    | "onboarding"
    | "first-agent"
    | "agents"
    | "agent"
    | "sites"
    | "webhooks"
    | "webhook"
    | "logs"
    | "approvals"
    | "inbox"
    | "docs"
    | "settings"
    | "managed-profiles"
    | "managed-profiles-activity";
  id?: string;
}) {
  const user = await getCurrentDeveloper();
  // Layout already authenticated; this is a safety check for banner state.
  const showSetupBanner = user ? await shouldShowAccountSetupBannerForUser(user.userId) : false;
  return (
    <DashboardViews
      view={view}
      id={id}
      emailVerified={user?.emailVerified !== false}
      showSetupBanner={showSetupBanner}
    />
  );
}
