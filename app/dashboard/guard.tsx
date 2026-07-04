import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { shouldForceAccountSetup, shouldShowAccountSetupBannerForUser } from "@/lib/onboardingRedirect";
import { DashboardShell } from "./client";

export async function ProtectedDashboard({ view, id }: { view: "home" | "onboarding" | "first-agent" | "agents" | "agent" | "sites" | "webhooks" | "webhook" | "logs" | "approvals" | "inbox" | "docs" | "settings"; id?: string }) {
  const user = await getCurrentDeveloper();
  if (!user) redirect("/login");
  if (await shouldForceAccountSetup(user.userId)) redirect("/onboarding");
  const showSetupBanner = await shouldShowAccountSetupBannerForUser(user.userId);
  return (
    <DashboardShell
      view={view}
      id={id}
      emailVerified={user.emailVerified !== false}
      showSetupBanner={showSetupBanner}
    />
  );
}
