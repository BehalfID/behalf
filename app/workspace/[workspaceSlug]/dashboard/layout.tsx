import { notFound, redirect } from "next/navigation";
import { getCurrentDeveloperContext } from "@/lib/developerAuth";
import { requireWorkspaceMembershipBySlug } from "@/lib/accountContext";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import { validateWorkspaceSlug } from "@/lib/workspaceSlug";
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

  const context = await getCurrentDeveloperContext();
  if (!context?.user) {
    redirect(`/login?next=/${workspaceSlug}/dashboard`);
  }

  if (await shouldForceAccountSetup(context.user.userId)) {
    redirect("/onboarding");
  }

  const resolved = await requireWorkspaceMembershipBySlug(context.user.userId, workspaceSlug);
  if ("error" in resolved) {
    if (resolved.status === 404) notFound();
    // Existing workspace the user cannot access — do not leak details.
    notFound();
  }

  return (
    <WorkspaceDashboardProviders workspaceSlug={resolved.workspace.slug}>
      {children}
    </WorkspaceDashboardProviders>
  );
}
