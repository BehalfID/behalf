import { DashboardShellLayout } from "@/components/layout/DashboardShell";
import { resolveDashboardShellProps } from "@/lib/dashboardShellServer";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Identity, plan, usage and authority all resolve server-side so the sidebar
  // renders complete on first paint instead of assembling after hydration.
  const shell = await resolveDashboardShellProps();

  return (
    <DashboardShellLayout
      canMutate={shell.canMutate}
      effectivePlan={shell.effectivePlan}
      planIsComplimentary={shell.planIsComplimentary}
      usage={shell.usage}
      user={shell.user}
    >
      {children}
    </DashboardShellLayout>
  );
}
