"use client";

import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { SessionInactivityMonitor } from "@/components/auth/SessionInactivityMonitor";
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
      <SessionInactivityMonitor />
      <DashboardShellLayout workspaceSlug={workspaceSlug}>{children}</DashboardShellLayout>
    </WorkspaceProvider>
  );
}
