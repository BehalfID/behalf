"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo, ThemeToggle } from "@/components/ui";

const dashboardNavSections = [
  {
    label: "Control plane",
    items: [
      { href: "/dashboard", label: "Home" },
      { href: "/dashboard/inbox", label: "Needs attention" },
      { href: "/dashboard/approvals", label: "Approvals" },
      { href: "/dashboard/logs", label: "Audit logs" },
    ]
  },
  {
    label: "Agents & access",
    items: [
      { href: "/dashboard/onboarding", label: "Add agent" },
      { href: "/dashboard/agents", label: "Agents" },
      { href: "/dashboard/webhooks", label: "Webhooks" },
    ]
  },
  {
    label: "Workspace",
    items: [
      { href: "/dashboard/settings", label: "Settings & members" },
      { href: "/dashboard/billing", label: "Billing" },
      { href: "/dashboard/docs", label: "Docs" },
    ]
  }
] as const;

type WorkspaceAccount = {
  accountId: string;
  name: string;
  role: string;
  isPrimary: boolean;
};

function WorkspaceSwitcher() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<WorkspaceAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/accounts", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { activeAccountId: string | null; accounts: WorkspaceAccount[] };
        setAccounts(body.accounts ?? []);
        setActiveAccountId(body.activeAccountId);
      } catch {
        // Ignore — single-account users still work without the switcher.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (accounts.length <= 1) return null;

  const switchAccount = async (accountId: string) => {
    if (accountId === activeAccountId || switching) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/dashboard/accounts/switch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId })
      });
      if (!res.ok) throw new Error("switch failed");
      setActiveAccountId(accountId);
      router.refresh();
    } catch {
      // Keep current workspace on failure.
    } finally {
      setSwitching(false);
    }
  };

  const activeAccount = accounts.find((account) => account.accountId === activeAccountId);

  return (
    <div className="workspace-switcher">
      <label className="workspace-switcher__label">
        <span>Workspace</span>
        <select
          value={activeAccountId ?? ""}
          disabled={switching}
          onChange={(event) => void switchAccount(event.target.value)}
          aria-label="Switch workspace"
        >
          {accounts.map((account) => (
            <option key={account.accountId} value={account.accountId}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      {activeAccount ? <small className="workspace-switcher__role">{activeAccount.role}</small> : null}
    </div>
  );
}

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
        <Logo href="/dashboard" subtitle="Control plane" />
      </div>
      <div className="app-mobile-workspace">
        <WorkspaceSwitcher />
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

        <Logo href="/dashboard" subtitle="Control plane" />
        <WorkspaceSwitcher />
        <nav aria-label="Dashboard">
          {dashboardNavSections.map((section) => (
            <div key={section.label}>
              <p className="app-sidebar__section-label">{section.label}</p>
              {section.items.map((item) => (
                <Link
                  aria-current={pathname === item.href ? "page" : undefined}
                  href={item.href}
                  key={item.href}
                  onClick={closeDrawer}
                >
                  {item.label}
                </Link>
              ))}
            </div>
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
