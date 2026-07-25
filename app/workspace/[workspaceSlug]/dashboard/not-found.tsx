import { ButtonLink, DashboardState, Logo } from "@/components/ui";

export default function WorkspaceNotFound() {
  return (
    <main id="main-content" className="dashboard-state-page" tabIndex={-1}>
      <Logo href="/" markStyle="framed" subtitle="Control plane" />
      <DashboardState
        action={<ButtonLink href="/dashboard">Go to your dashboard</ButtonLink>}
        description="That workspace URL does not exist, or your account does not have access to it."
        kind="no-workspace"
        title="Workspace not found"
      />
    </main>
  );
}
