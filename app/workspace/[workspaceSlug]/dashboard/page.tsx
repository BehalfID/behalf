import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { requireWorkspaceMembershipBySlug } from "@/lib/accountContext";
import { findAccountById } from "@/lib/repositories/accounts";
import { loadDashboardOverview } from "@/lib/dashboardOverview";
import { workspaceDashboardHref } from "@/lib/workspaceSlug";
import { OverviewView } from "@/components/dashboard/overview/OverviewView";

export const metadata: Metadata = {
  title: "Overview — BehalfID",
  description: "What your agents did, and what is waiting on a person right now."
};

/**
 * Overview is server-rendered rather than routed through the legacy client
 * `DashboardShell` view switch: every value it shows is an aggregate, so
 * resolving them on the server avoids a client round trip and keeps the metric
 * definitions in one place (`lib/dashboardOverview.ts`).
 *
 * The layout has already authenticated the request and verified membership;
 * this re-resolves the workspace only to obtain the account and role, and both
 * calls are request-cached.
 */
export default async function WorkspaceDashboardPage({
  params
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const user = await getCurrentDeveloper();
  if (!user) notFound();

  const resolved = await requireWorkspaceMembershipBySlug(user.userId, workspaceSlug);
  if ("error" in resolved) notFound();

  const account = await findAccountById(resolved.workspace.accountId);
  const data = await loadDashboardOverview({
    accountId: resolved.workspace.accountId,
    account,
    role: resolved.workspace.role
  });

  return (
    <OverviewView
      data={data}
      href={(subpath) => workspaceDashboardHref(resolved.workspace.slug, subpath)}
    />
  );
}
