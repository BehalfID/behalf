import { DashboardShellLayout } from "@/components/layout/DashboardShell";
import { AnalyticsIdentity } from "@/components/analytics/AnalyticsIdentity";
import { resolveDashboardShellProps } from "@/lib/dashboardShellServer";
import { getCurrentDeveloperContext } from "@/lib/developerAuth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Identity, plan, usage and authority all resolve server-side so the sidebar
  // renders complete on first paint instead of assembling after hydration.
  const shell = await resolveDashboardShellProps();
  // The stable internal user id is the join key for server-sent business
  // events; it is deliberately not the email or a session token.
  const context = await getCurrentDeveloperContext();

  return (
    <DashboardShellLayout
      canMutate={shell.canMutate}
      effectivePlan={shell.effectivePlan}
      planIsComplimentary={shell.planIsComplimentary}
      usage={shell.usage}
      user={shell.user}
    >
      {context?.user ? (
        <AnalyticsIdentity
          userId={context.user.userId}
          email={context.user.email}
          name={shell.user?.name ?? null}
          plan={shell.effectivePlan ?? null}
        />
      ) : null}
      {children}
    </DashboardShellLayout>
  );
}
