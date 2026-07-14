import { shouldShowAccountSetupBannerForUser } from "@/lib/onboardingRedirect";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { DashboardViews } from "@/app/dashboard/client";
import type { AgentDetailSection } from "@/components/dashboard/agent-detail/types";

export async function WorkspaceProtectedDashboard({
  view,
  id,
  agentSection = "overview"
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
  agentSection?: AgentDetailSection;
}) {
  const user = await getCurrentDeveloper();
  // Layout already authenticated; this is a safety check for banner state.
  const showSetupBanner = user ? await shouldShowAccountSetupBannerForUser(user.userId) : false;
  return (
    <DashboardViews
      view={view}
      id={id}
      agentSection={agentSection}
      emailVerified={user?.emailVerified !== false}
      showSetupBanner={showSetupBanner}
    />
  );
}
