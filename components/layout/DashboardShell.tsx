"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo, ThemeToggle } from "@/components/ui";
import { useDashboardApi, useOptionalWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  extractDashboardSubpath,
  workspaceDashboardHref,
  workspaceApiHref
} from "@/lib/workspaceSlug";

const dashboardNavItems = [
  {
    label: "Control plane",
    items: [
      { subpath: "", label: "Home" },
      { subpath: "/inbox", label: "Needs attention" },
      { subpath: "/approvals", label: "Approvals" },
      { subpath: "/logs", label: "Audit logs" }
    ]
  },
  {
    label: "Agents & access",
    items: [
      { subpath: "/onboarding", label: "Add agent" },
      { subpath: "/agents", label: "Agents" },
      { subpath: "/webhooks", label: "Webhooks" }
    ]
  },
  {
    label: "Workspace",
    items: [
      { subpath: "/settings", label: "Settings & members" },
      { subpath: "/managed-profiles", label: "Managed profiles" },
      { subpath: "/billing", label: "Billing" },
      { subpath: "/docs", label: "Docs" }
    ]
  }
] as const;

type WorkspaceAccount = {
  accountId: string;
  slug: string | null;
  name: string;
  role: string;
  isPrimary: boolean;
};

function WorkspaceSwitcher({ workspaceSlug }: { workspaceSlug?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const { fetch: dashboardFetch } = useDashboardApi();
  const [accounts, setAccounts] = useState<WorkspaceAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Prefer explicit prop/context slug; fall back to useDashboardApi when unscoped.
        const path = workspaceSlug
          ? workspaceApiHref(workspaceSlug, "/api/dashboard/accounts")
          : "/api/dashboard/accounts";
        const res = workspaceSlug
          ? await fetch(path, { credentials: "include" })
          : await dashboardFetch(path);
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          activeAccountId: string | null;
          accounts: WorkspaceAccount[];
        };
        setAccounts(body.accounts ?? []);
        setActiveAccountId(body.activeAccountId);
      } catch {
        // Ignore — single-account users still work without the switcher.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, dashboardFetch]);

  if (accounts.length <= 1) return null;

  const switchAccount = async (accountId: string) => {
    if (accountId === activeAccountId || switching) return;
    const target = accounts.find((account) => account.accountId === accountId);
    if (!target?.slug) return;
    setSwitching(true);
    try {
      const path = workspaceSlug
        ? workspaceApiHref(workspaceSlug, "/api/dashboard/accounts/switch")
        : "/api/dashboard/accounts/switch";
      const res = workspaceSlug
        ? await fetch(path, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountId })
          })
        : await dashboardFetch(path, {
            method: "POST",
            body: JSON.stringify({ accountId })
          });
      if (!res.ok) throw new Error("switch failed");
      const body = (await res.json()) as { ok: boolean; activeAccountId: string; slug?: string | null };
      const nextSlug = body.slug ?? target.slug;
      if (!nextSlug) throw new Error("missing slug");
      setActiveAccountId(accountId);
      const subpath = extractDashboardSubpath(pathname);
      router.push(workspaceDashboardHref(nextSlug, subpath));
    } catch {
      // Keep current workspace on failure — do not update the URL.
    } finally {
      setSwitching(false);
    }
  };

  const activeAccount =
    accounts.find((account) => account.slug === workspaceSlug) ??
    accounts.find((account) => account.accountId === activeAccountId);

  return (
    <div className="workspace-switcher">
      <label className="workspace-switcher__label">
        <span>Workspace</span>
        <select
          value={activeAccount?.accountId ?? activeAccountId ?? ""}
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

export function DashboardShellLayout({
  children,
  workspaceSlug: workspaceSlugProp
}: {
  children: React.ReactNode;
  workspaceSlug?: string | null;
}) {
  const pathname = usePathname();
  const workspaceCtx = useOptionalWorkspace();
  const workspaceSlug = workspaceSlugProp ?? workspaceCtx?.workspaceSlug ?? null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const navSections = useMemo(() => {
    return dashboardNavItems.map((section) => ({
      label: section.label,
      items: section.items.map((item) => ({
        label: item.label,
        href: workspaceSlug
          ? workspaceDashboardHref(workspaceSlug, item.subpath)
          : `/dashboard${item.subpath}`
      }))
    }));
  }, [workspaceSlug]);

  const homeHref = workspaceSlug ? workspaceDashboardHref(workspaceSlug) : "/dashboard";

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }, []);

  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

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
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    el?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <main className="dashboard-shell app-shell">
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
        <Logo href={homeHref} subtitle="Control plane" />
      </div>
      <div className="app-mobile-workspace">
        <WorkspaceSwitcher workspaceSlug={workspaceSlug} />
      </div>

      {drawerOpen && (
        <div className="app-drawer-backdrop" aria-hidden="true" onClick={closeDrawer} />
      )}

      <aside
        id="dashboard-drawer"
        ref={drawerRef}
        className={`dashboard-sidebar app-sidebar${drawerOpen ? " app-sidebar--open" : ""}`}
        role="navigation"
        aria-label="Dashboard"
      >
        <button className="app-drawer-close" onClick={closeDrawer} aria-label="Close menu">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <Logo href={homeHref} subtitle="Control plane" />
        <WorkspaceSwitcher workspaceSlug={workspaceSlug} />
        <nav aria-label="Dashboard">
          {navSections.map((section) => (
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

      <section id="main-content" className="dashboard-main app-main" tabIndex={-1}>
        {children}
      </section>
    </main>
  );
}
