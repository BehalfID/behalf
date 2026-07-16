import { DashboardState, PageHeader } from "@/components/ui";

export default function WorkspaceDashboardLoading() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Loading control plane"
        description="Preparing the latest workspace state."
        className="dashboard-header"
      />
      <DashboardState kind="loading" />
    </>
  );
}
