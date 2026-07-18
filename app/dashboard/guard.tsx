import { redirect } from "next/navigation";
import { getCurrentDeveloperContext } from "@/lib/developerAuth";
import { requiresEmailVerificationRedirect } from "@/lib/emailVerificationGuard";
import { shouldForceAccountSetup, shouldShowAccountSetupBannerForUser } from "@/lib/onboardingRedirect";
import { extractDashboardSubpath, workspaceDashboardHref } from "@/lib/workspaceSlug";
import { ensureAccountHasSlug } from "@/lib/workspaceSlugServer";
import { findAccountByIdLean } from "@/lib/repositories/accounts";
import { DashboardShell } from "./client";

/**
 * Legacy /dashboard/* entry. Temporarily redirects authenticated users to
 * /<workspaceSlug>/dashboard/* using their active/primary workspace.
 */
export async function ProtectedDashboard({
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
  const context = await getCurrentDeveloperContext();
  if (!context?.user) redirect("/login");
  if (requiresEmailVerificationRedirect(context.user)) redirect("/verify-email");
  if (await shouldForceAccountSetup(context.user.userId)) redirect("/onboarding");

  const accountId = context.activeAccountId ?? context.user.primaryAccountId ?? null;
  if (accountId) {
    const account = await findAccountByIdLean(accountId, "accountId slug name companyName");
    let slug = account?.slug?.trim().toLowerCase() || null;
    if (!slug) {
      slug = await ensureAccountHasSlug(accountId);
    }
    if (slug) {
      // Reconstruct subpath from view for the temporary redirect.
      const subpath = legacyViewToSubpath(view, id);
      redirect(workspaceDashboardHref(slug, subpath));
    }
  }

  // Controlled setup fallback when slug cannot be resolved — avoid redirect loops.
  const showSetupBanner = await shouldShowAccountSetupBannerForUser(context.user.userId);
  return (
    <DashboardShell
      view={view}
      id={id}
      emailVerified={context.user.emailVerified !== false}
      showSetupBanner={showSetupBanner}
    />
  );
}

function legacyViewToSubpath(
  view: string,
  id?: string
): string {
  switch (view) {
    case "home":
      return "";
    case "agent":
      return id ? `/agents/${id}` : "/agents";
    case "webhook":
      return id ? `/webhooks/${id}` : "/webhooks";
    case "first-agent":
      return "/agents/new";
    case "managed-profiles-activity":
      return "/managed-profiles/activity";
    default:
      return `/${view}`;
  }
}

/** @deprecated Prefer extractDashboardSubpath from workspaceSlug. */
export function legacyDashboardSubpath(pathname: string): string {
  return extractDashboardSubpath(pathname);
}
