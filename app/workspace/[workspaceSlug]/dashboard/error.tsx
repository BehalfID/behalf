"use client";

import { Button, DashboardState, PageHeader } from "@/components/ui";

export default function WorkspaceDashboardError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Control plane unavailable"
        description="The dashboard encountered an unexpected error."
        className="dashboard-header"
      />
      <DashboardState
        action={<Button onClick={reset}>Try again</Button>}
        kind="error"
      />
    </>
  );
}
