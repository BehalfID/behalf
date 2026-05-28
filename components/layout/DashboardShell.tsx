"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }, []);

  // Close on route change
  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  // Escape key + focus trap
  useEffect(() => {
    if (!drawerOpen) return;

    const el = drawerRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    el?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, closeDrawer]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  return (
    <main className="dashboard-shell app-shell">
      {/* Mobile top bar — only visible on mobile */}
      <div className="app-mobile-topbar">
        <button
          ref={hamburgerRef}
          className="app-mobile-hamburger"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          aria-expanded={drawerOpen}
          aria-controls="dashboard-drawer"
        >
          {drawerOpen ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <Logo href="/dashboard" subtitle="Developer portal" />
      </div>

      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="app-drawer-backdrop"
          aria-hidden="true"
          onClick={closeDrawer}
        />
      )}

      <aside
        id="dashboard-drawer"
        ref={drawerRef}
        className={`dashboard-sidebar app-sidebar${drawerOpen ? " app-sidebar--open" : ""}`}
        role="navigation"
        aria-label="Dashboard"
      >
        {/* Close button inside drawer (mobile only) */}
        <button
          className="app-drawer-close"
          onClick={closeDrawer}
          aria-label="Close menu"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <Logo href="/dashboard" subtitle="Developer portal" />
        <nav aria-label="Dashboard">
          {dashboardNav.map((item) => (
            <Link
              aria-current={pathname === item.href ? "page" : undefined}
              href={item.href}
              key={item.href}
              onClick={closeDrawer}
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
