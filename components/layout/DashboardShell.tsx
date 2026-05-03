"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui";

const dashboardNav = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/onboarding", label: "Add agent" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/webhooks", label: "Webhooks" },
  { href: "/dashboard/logs", label: "Logs" },
  { href: "/dashboard/docs", label: "Docs" },
  { href: "/dashboard/settings", label: "Settings" }
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
        <a className="ui-button ui-button--secondary app-sidebar__logout" href="/logout">
          Log out
        </a>
      </aside>
      <section className="dashboard-main app-main">{children}</section>
    </main>
  );
}
