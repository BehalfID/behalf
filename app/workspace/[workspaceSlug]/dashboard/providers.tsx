"use client";

import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { DashboardShellLayout } from "@/components/layout/DashboardShell";

export function WorkspaceDashboardProviders({
  workspaceSlug,
  children
}: {
  workspaceSlug: string;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider workspaceSlug={workspaceSlug}>
      <DashboardShellLayout workspaceSlug={workspaceSlug}>{children}</DashboardShellLayout>
    </WorkspaceProvider>
  );
}
