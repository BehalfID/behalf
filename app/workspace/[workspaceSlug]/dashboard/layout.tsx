import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentDeveloperContext } from "@/lib/developerAuth";
import { requiresEmailVerificationRedirect } from "@/lib/emailVerificationGuard";
import { requireWorkspaceMembershipBySlug } from "@/lib/accountContext";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import { REQUEST_PATH_HEADER, resolveOwnedHref } from "@/lib/subdomainRouting";
import { validateWorkspaceSlug } from "@/lib/workspaceSlug";
import { resolveDashboardShellProps } from "@/lib/dashboardShellServer";
import { WorkspaceDashboardProviders } from "./providers";

export default async function WorkspaceDashboardLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug: rawSlug } = await params;
  const workspaceSlug = rawSlug.trim().toLowerCase();

  if (validateWorkspaceSlug(workspaceSlug) !== null) {
    notFound();
  }

  const requestHeaders = await headers();
  const requestPath = requestHeaders.get(REQUEST_PATH_HEADER);
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  const context = await getCurrentDeveloperContext();
  if (!context?.user) {
    const fallback = `/${workspaceSlug}/dashboard`;
    const nextTarget =
      requestPath &&
      (requestPath === fallback ||
        requestPath.startsWith(`${fallback}/`) ||
        requestPath.startsWith(`${fallback}?`))
        ? requestPath
        : fallback;
    redirect(
      resolveOwnedHref(`/login?next=${encodeURIComponent(nextTarget)}`, {
        hostname: host
      })
    );
  }

  if (requiresEmailVerificationRedirect(context.user)) {
    redirect(resolveOwnedHref("/verify-email", { hostname: host }));
  }

  if (await shouldForceAccountSetup(context.user.userId)) {
    redirect(resolveOwnedHref("/onboarding", { hostname: host }));
  }

  const resolved = await requireWorkspaceMembershipBySlug(context.user.userId, workspaceSlug);
  if ("error" in resolved) {
    if (resolved.status === 404) notFound();
    // Existing workspace the user cannot access — do not leak details.
    notFound();
  }

  // Scope the sidebar plan to the workspace being viewed rather than the
  // session's active account — they differ while a switch is in flight.
  const shell = await resolveDashboardShellProps(resolved.workspace.accountId);

  return (
    <WorkspaceDashboardProviders
      effectivePlan={shell.effectivePlan}
      user={shell.user}
      workspaceSlug={resolved.workspace.slug}
    >
      {children}
    </WorkspaceDashboardProviders>
  );
}
