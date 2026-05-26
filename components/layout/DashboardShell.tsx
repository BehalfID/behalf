"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, ThemeToggle } from "@/components/ui";

const dashboardNav = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/onboarding", label: "Add agent" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/webhooks", label: "Webhooks" },
  { href: "/dashboard/logs", label: "Logs" },
  { href: "/dashboard/approvals", label: "Approvals" },
  { href: "/dashboard/docs", label: "Docs" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/sites", label: "Site Guard" },
];

export function DashboardShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="dashboard-shell app-shell">
      <aside className="dashboard-sidebar app-sidebar">
        <Logo href="/dashboard" subtitle="Developer portal" />
        <nav aria-label="Dashboard">
          {dashboardNav.map((item) => (
            <Link
              aria-current={pathname === item.href ? "page" : undefined}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="app-sidebar__footer">
          <ThemeToggle />
          <a className="ui-button ui-button--secondary app-sidebar__logout" href="/logout">
            Log out
          </a>
        </div>
      </aside>
      <section id="main-content" className="dashboard-main app-main" tabIndex={-1}>{children}</section>
    </main>
  );
}
