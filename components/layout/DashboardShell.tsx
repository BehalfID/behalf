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
import {
  getDashboardContentVariant,
  isDashboardNavItemActive
} from "@/lib/dashboardShellPresentation";

type NavIconName =
  | "home"
  | "attention"
  | "approvals"
  | "logs"
  | "add"
  | "agents"
  | "webhooks"
  | "settings"
  | "profiles"
  | "billing"
  | "docs";

const dashboardNavItems = [
  {
    label: "Control plane",
    items: [
      { subpath: "", label: "Home", icon: "home" },
      { subpath: "/inbox", label: "Needs attention", icon: "attention" },
      { subpath: "/approvals", label: "Approvals", icon: "approvals" },
      { subpath: "/logs", label: "Audit logs", icon: "logs" }
    ]
  },
  {
    label: "Agents & access",
    items: [
      { subpath: "/onboarding", label: "Add agent", icon: "add" },
      { subpath: "/agents", label: "Agents", icon: "agents" },
      { subpath: "/webhooks", label: "Webhooks", icon: "webhooks" }
    ]
  },
  {
    label: "Workspace",
    items: [
      { subpath: "/settings", label: "Settings & members", icon: "settings" },
      { subpath: "/managed-profiles", label: "Managed profiles", icon: "profiles" },
      { subpath: "/billing", label: "Billing", icon: "billing" },
      { subpath: "/docs", label: "Docs", icon: "docs" }
    ]
  }
] as const satisfies ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ subpath: string; label: string; icon: NavIconName }>;
}>;

type WorkspaceAccount = {
  accountId: string;
  slug: string | null;
  name: string;
  role: string;
  isPrimary: boolean;
};

type WorkspaceState = {
  accounts: WorkspaceAccount[];
  activeAccount: WorkspaceAccount | null;
  loaded: boolean;
  switching: boolean;
  switchAccount: (accountId: string) => Promise<void>;
};

function useWorkspaceAccounts(workspaceSlug: string | null): WorkspaceState {
  const router = useRouter();
  const pathname = usePathname();
  const { fetch: dashboardFetch } = useDashboardApi();
  const [accounts, setAccounts] = useState<WorkspaceAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
        // The current workspace remains usable if account metadata is unavailable.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, dashboardFetch]);

  const activeAccount =
    accounts.find((account) => account.slug === workspaceSlug) ??
    accounts.find((account) => account.accountId === activeAccountId) ??
    null;

  const switchAccount = useCallback(async (accountId: string) => {
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
      router.push(workspaceDashboardHref(nextSlug, extractDashboardSubpath(pathname)));
    } catch {
      // Keep the current workspace and URL when switching fails.
    } finally {
      setSwitching(false);
    }
  }, [accounts, activeAccountId, dashboardFetch, pathname, router, switching, workspaceSlug]);

  return { accounts, activeAccount, loaded, switching, switchAccount };
}

function WorkspaceSwitcher({
  state,
  workspaceSlug
}: {
  state: WorkspaceState;
  workspaceSlug: string | null;
}) {
  const fallbackName = workspaceSlug
    ? workspaceSlug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
    : "Current workspace";
  const workspaceName = state.activeAccount?.name ?? fallbackName;
  const workspaceRole = state.activeAccount?.role ?? null;

  return (
    <div className="workspace-switcher" aria-busy={!state.loaded || state.switching}>
      <span className="workspace-switcher__eyebrow">Workspace</span>
      {state.accounts.length > 1 ? (
        <label className="workspace-switcher__label">
          <span className="sr-only">Switch workspace</span>
          <select
            value={state.activeAccount?.accountId ?? ""}
            disabled={state.switching}
            onChange={(event) => void state.switchAccount(event.target.value)}
            aria-label="Switch workspace"
          >
            {state.accounts.map((account) => (
              <option key={account.accountId} value={account.accountId}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <strong className="workspace-switcher__name" title={workspaceName}>{workspaceName}</strong>
      )}
      {workspaceRole ? <small className="workspace-switcher__role">{workspaceRole}</small> : null}
    </div>
  );
}

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, React.ReactNode> = {
    home: <><path d="M3 8.5 10 3l7 5.5" /><path d="M5 7.5V17h10V7.5M8 17v-5h4v5" /></>,
    attention: <><path d="M10 3 2.8 16h14.4L10 3Z" /><path d="M10 7.5v4M10 14h.01" /></>,
    approvals: <><path d="M6 3h8v14H6z" /><path d="M8 7h4M8 10h4M8 13h2" /><path d="M8 3V2h4v1" /></>,
    logs: <><path d="M4 3h12v14H4z" /><path d="M7 7h6M7 10h6M7 13h4" /></>,
    add: <><circle cx="10" cy="10" r="7" /><path d="M10 6.5v7M6.5 10h7" /></>,
    agents: <><circle cx="10" cy="8" r="3" /><path d="M4.5 17c.8-3.2 2.6-4.8 5.5-4.8s4.7 1.6 5.5 4.8" /></>,
    webhooks: <><circle cx="6" cy="6" r="2.5" /><circle cx="14" cy="8" r="2.5" /><circle cx="9" cy="15" r="2.5" /><path d="m8 6.5 3.5.8M12.5 10l-2 2.8M7.5 12.8 6.8 8.5" /></>,
    settings: <><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" /></>,
    profiles: <><path d="M4 4h12v12H4z" /><path d="M7 7h6M7 10h6M7 13h3" /></>,
    billing: <><path d="M3 5h14v10H3z" /><path d="M3 8h14M6 12h3" /></>,
    docs: <><path d="M5 3h8l2 2v12H5z" /><path d="M13 3v3h3M8 10h4M8 13h4" /></>
  };
  return (
    <svg className="dashboard-nav__icon" viewBox="0 0 20 20" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function useMobileShell() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 859px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isMobile;
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
  const workspaceState = useWorkspaceAccounts(workspaceSlug);
  const isMobile = useMobileShell();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const navSections = useMemo(() => dashboardNavItems.map((section) => ({
    label: section.label,
    items: section.items.map((item) => ({
      ...item,
      href: workspaceSlug
        ? workspaceDashboardHref(workspaceSlug, item.subpath)
        : `/dashboard${item.subpath}`
    }))
  })), [workspaceSlug]);

  const currentItem = (() => {
    for (const section of navSections) {
      const item = section.items.find((candidate) => isDashboardNavItemActive(pathname, candidate.href));
      if (item) return { group: section.label, label: item.label };
    }
    return { group: "Workspace", label: "Dashboard" };
  })();

  const homeHref = workspaceSlug ? workspaceDashboardHref(workspaceSlug) : "/dashboard";
  const contentVariant = getDashboardContentVariant(pathname);
  const workspaceName = workspaceState.activeAccount?.name ?? workspaceSlug ?? "Workspace";

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!drawerOpen || !isMobile) return;
    const el = drawerRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab" || !el) return;
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((node) => !node.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    drawerRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeDrawer, drawerOpen, isMobile]);

  useEffect(() => {
    const lock = drawerOpen && isMobile;
    document.body.style.overflow = lock ? "hidden" : "";
    document.body.classList.toggle("dashboard-drawer-open", lock);
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("dashboard-drawer-open");
    };
  }, [drawerOpen, isMobile]);

  return (
    <div className="dashboard-shell app-shell" data-content-variant={contentVariant}>
      <aside
        id="dashboard-drawer"
        ref={drawerRef}
        className={`dashboard-sidebar app-sidebar${drawerOpen ? " app-sidebar--open" : ""}`}
        aria-hidden={isMobile && !drawerOpen ? true : undefined}
        aria-label={isMobile ? "Dashboard navigation" : undefined}
        aria-modal={isMobile && drawerOpen ? true : undefined}
        inert={isMobile && !drawerOpen ? true : undefined}
        role={isMobile ? "dialog" : undefined}
      >
        <div className="dashboard-sidebar__brand">
          <Logo href={homeHref} markStyle="framed" subtitle="Control plane" />
          <button className="app-drawer-close" onClick={closeDrawer} aria-label="Close navigation" type="button">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 3l12 12M15 3 3 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <WorkspaceSwitcher state={workspaceState} workspaceSlug={workspaceSlug} />

        <nav className="dashboard-nav" aria-label="Dashboard">
          {navSections.map((section, sectionIndex) => {
            const labelId = `dashboard-nav-section-${sectionIndex}`;
            return (
              <section className="dashboard-nav__section" aria-labelledby={labelId} key={section.label}>
                <p className="app-sidebar__section-label" id={labelId}>{section.label}</p>
                <ul>
                  {section.items.map((item) => {
                    const active = isDashboardNavItemActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          aria-current={active ? "page" : undefined}
                          href={item.href}
                          onClick={isMobile ? closeDrawer : undefined}
                        >
                          <NavIcon name={item.icon} />
                          <span>{item.label}</span>
                          {active ? <span className="sr-only">, current page</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </nav>

        <div className="app-sidebar__footer">
          <div className="dashboard-sidebar__theme">
            <span>Appearance</span>
            <ThemeToggle />
          </div>
          {/* A document navigation is intentional: the GET route clears the session before redirecting. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="ui-button ui-button--secondary app-sidebar__logout" href="/logout">
            Log out
          </a>
        </div>
      </aside>

      <div
        className="dashboard-workspace"
        inert={isMobile && drawerOpen ? true : undefined}
        aria-hidden={isMobile && drawerOpen ? true : undefined}
      >
        <header className="dashboard-topbar">
          <nav className="dashboard-breadcrumb" aria-label="Current location">
            <span>{currentItem.group}</span>
            <span aria-hidden="true">/</span>
            <strong aria-current="page">{currentItem.label}</strong>
          </nav>
          <div className="dashboard-topbar__workspace" title={workspaceName}>
            <span className="cx-dot" aria-hidden="true" />
            <span>{workspaceName}</span>
          </div>
        </header>

        <header className="app-mobile-topbar">
          <button
            ref={hamburgerRef}
            className="app-mobile-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="dashboard-drawer"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <div className="app-mobile-topbar__context">
            <strong>{currentItem.label}</strong>
            <span title={workspaceName}>{workspaceName}</span>
          </div>
          <Logo href={homeHref} variant="symbol" />
        </header>

        <main
          id="main-content"
          className={`dashboard-main app-main dashboard-main--${contentVariant}`}
          tabIndex={-1}
        >
          <p className="sr-only" aria-live="polite">{currentItem.label}, current page</p>
          {children}
        </main>
      </div>

      {drawerOpen && isMobile ? (
        <button
          className="app-drawer-backdrop"
          aria-label="Close navigation"
          onClick={closeDrawer}
          tabIndex={-1}
          type="button"
        />
      ) : null}
    </div>
  );
}
