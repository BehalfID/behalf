import { DashboardShellLayout } from "@/components/layout/DashboardShell";
import { resolveDashboardShellProps } from "@/lib/dashboardShellServer";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Identity and plan resolve server-side so the sidebar renders complete on
  // first paint instead of swapping in after hydration.
  const shell = await resolveDashboardShellProps();

  return (
    <DashboardShellLayout effectivePlan={shell.effectivePlan} user={shell.user}>
      {children}
    </DashboardShellLayout>
  );
}
