"use client";

import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { SessionInactivityMonitor } from "@/components/auth/SessionInactivityMonitor";
import {
  DashboardShellLayout,
  type DashboardShellUsage,
  type DashboardShellUser
} from "@/components/layout/DashboardShell";

export function WorkspaceDashboardProviders({
  canMutate = false,
  children,
  effectivePlan = null,
  planIsComplimentary = false,
  usage = null,
  user = null,
  workspaceSlug
}: {
  canMutate?: boolean;
  children: React.ReactNode;
  effectivePlan?: string | null;
  planIsComplimentary?: boolean;
  usage?: DashboardShellUsage | null;
  user?: DashboardShellUser | null;
  workspaceSlug: string;
}) {
  return (
    <WorkspaceProvider workspaceSlug={workspaceSlug}>
      <SessionInactivityMonitor />
      <DashboardShellLayout
        canMutate={canMutate}
        effectivePlan={effectivePlan}
        planIsComplimentary={planIsComplimentary}
        usage={usage}
        user={user}
        workspaceSlug={workspaceSlug}
      >
        {children}
      </DashboardShellLayout>
    </WorkspaceProvider>
  );
}
