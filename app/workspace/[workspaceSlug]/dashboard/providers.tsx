"use client";

import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { SessionInactivityMonitor } from "@/components/auth/SessionInactivityMonitor";
import {
  DashboardShellLayout,
  type DashboardShellUser
} from "@/components/layout/DashboardShell";

export function WorkspaceDashboardProviders({
  children,
  effectivePlan = null,
  user = null,
  workspaceSlug
}: {
  children: React.ReactNode;
  effectivePlan?: string | null;
  user?: DashboardShellUser | null;
  workspaceSlug: string;
}) {
  return (
    <WorkspaceProvider workspaceSlug={workspaceSlug}>
      <SessionInactivityMonitor />
      <DashboardShellLayout
        effectivePlan={effectivePlan}
        user={user}
        workspaceSlug={workspaceSlug}
      >
        {children}
      </DashboardShellLayout>
    </WorkspaceProvider>
  );
}
