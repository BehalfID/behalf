"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, ThemeToggle } from "@/components/ui";

const consoleNav = [
  { href: "/console", label: "Dashboard" },
  { href: "/console/agents", label: "Agents" },
  { href: "/console/webhooks", label: "Webhooks" },
  { href: "/console/webhook-events", label: "Events" },
  { href: "/console/logs", label: "Logs" },
  { href: "/console/settings", label: "Settings" }
];

export function ConsoleShellLayout({
  children,
  onLogout
}: {
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  return (
    <main className="console-shell app-shell app-shell--console">
      <aside className="console-sidebar app-sidebar">
        <Logo href="/console" subtitle="Internal console" />
        <nav aria-label="Console">
          {consoleNav.map((item) => (
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
          <button className="ui-button ui-button--secondary app-sidebar__logout" onClick={onLogout} type="button">
            Logout
          </button>
        </div>
      </aside>
      <section className="console-workspace app-main">{children}</section>
    </main>
  );
}
