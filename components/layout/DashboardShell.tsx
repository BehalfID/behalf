"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo, ThemeToggle } from "@/components/ui";
import { DashboardRouteLoading } from "@/components/dashboard/DashboardRouteLoading";
import {
  DashboardOmniSearchProvider,
  DashboardOmniSearchTrigger
} from "@/components/dashboard/DashboardOmniSearch";
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
import {
  DashboardMenu,
  DashboardMenuItem,
  DashboardMenuLabel,
  DashboardMenuLink,
  DashboardMenuLogout,
  DashboardMenuSeparator
} from "@/components/layout/DashboardMenu";
import { workspaceInitials } from "@/lib/dashboardShellPresentation";

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
  | "docs"
  | "support"
  | "delegation";

const dashboardNavItems = [
  {
    label: "Control plane",
    items: [
      { subpath: "", label: "Home", icon: "home" },
      { subpath: "/inbox", label: "Needs attention", icon: "attention" },
      { subpath: "/approvals", label: "Approvals", icon: "approvals" },
      { subpath: "/adaptive-delegation", label: "Adaptive Delegation", icon: "delegation" },
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

/**
 * Lovable's shell closes the sidebar with a bordered secondary group linking out
 * to documentation and status. Docs is workspace-scoped in production; status is
 * a public host-neutral page, so it stays an absolute path.
 */
const secondaryNavItems = [
  { subpath: "/docs", label: "Documentation", icon: "docs", external: false },
  { href: "/status", label: "Status & support", icon: "support", external: true }
] as const;

/** Identity and plan resolved server-side and handed to the shell as props. */
export type DashboardShellUser = {
  name: string;
  email: string;
  initials: string;
};

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
  const [switchTargetSlug, setSwitchTargetSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!switchTargetSlug || workspaceSlug !== switchTargetSlug) return;
    // The new provider is active; it is now safe to reveal the new route tree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSwitching(false);
    setSwitchTargetSlug(null);
  }, [switchTargetSlug, workspaceSlug]);

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
    setSwitchTargetSlug(target.slug);
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
      setSwitching(false);
      setSwitchTargetSlug(null);
    }
  }, [accounts, activeAccountId, dashboardFetch, pathname, router, switching, workspaceSlug]);

  return { accounts, activeAccount, loaded, switching, switchAccount };
}

function WorkspaceSwitcher({
  effectivePlan,
  state,
  workspaceSlug
}: {
  /** Effective plan of the active workspace; null until the summary resolves. */
  effectivePlan: string | null;
  state: WorkspaceState;
  workspaceSlug: string | null;
}) {
  const fallbackName = workspaceSlug
    ? workspaceSlug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
    : "Current workspace";
  const workspaceName = state.activeAccount?.name ?? fallbackName;
  const workspaceRole = state.activeAccount?.role ?? null;

  // Plan is only known for the active workspace, so it is shown there and never
  // guessed for the others in the list.
  const descriptor = [effectivePlan, workspaceRole].filter(Boolean).join(" · ");
  const identity = (
    <>
      <span aria-hidden="true" className="workspace-switcher__mark">
        {workspaceInitials(workspaceName)}
      </span>
      <span className="workspace-switcher__text">
        <span className="workspace-switcher__name" title={workspaceName}>
          {workspaceName}
        </span>
        {descriptor ? (
          <span className="workspace-switcher__meta">{descriptor}</span>
        ) : null}
      </span>
    </>
  );

  // One workspace means nothing to switch to; rendering a menu that only ever
  // contains the current workspace would be a control that does nothing.
  if (state.accounts.length <= 1) {
    return (
      <div className="workspace-switcher" aria-busy={!state.loaded || state.switching}>
        <div className="workspace-switcher__static">{identity}</div>
      </div>
    );
  }

  return (
    <div className="workspace-switcher" aria-busy={!state.loaded || state.switching}>
      <DashboardMenu label="Switch workspace" trigger={identity}>
        <DashboardMenuLabel>Workspaces</DashboardMenuLabel>
        {state.accounts.map((account) => (
          <DashboardMenuItem
            disabled={state.switching}
            key={account.accountId}
            onSelect={() => void state.switchAccount(account.accountId)}
            selected={account.accountId === state.activeAccount?.accountId}
          >
            <span className="dashboard-menu__item-main">{account.name}</span>
            <span className="dashboard-menu__item-meta">{account.role}</span>
          </DashboardMenuItem>
        ))}
      </DashboardMenu>
    </div>
  );
}

/**
 * Sidebar user menu, ported from the Lovable shell. Identity is passed down from
 * the server layout rather than fetched: the shell already makes one client
 * request for workspace accounts, and the user's own name and email are known
 * during SSR, so fetching them again would add a request and a visible swap
 * from placeholder to real name on every dashboard page.
 */
function UserMenu({
  user,
  workspaceSlug
}: {
  user: DashboardShellUser | null;
  workspaceSlug: string | null;
}) {
  const settingsHref = workspaceSlug
    ? workspaceDashboardHref(workspaceSlug, "/settings")
    : "/dashboard/settings";

  if (!user) {
    // No identity resolved: still offer sign-out rather than an empty footer.
    return (
      // eslint-disable-next-line @next/next/no-html-link-for-pages
      <a className="ui-button ui-button--secondary app-sidebar__logout" href="/logout">
        Log out
      </a>
    );
  }

  return (
    <DashboardMenu
      align="end"
      className="dashboard-user-menu"
      label="Account menu"
      trigger={
        <>
          <span aria-hidden="true" className="dashboard-user-menu__avatar">
            {user.initials}
          </span>
          <span className="dashboard-user-menu__text">
            <span className="dashboard-user-menu__name" title={user.name}>
              {user.name}
            </span>
            <span className="dashboard-user-menu__email" title={user.email}>
              {user.email}
            </span>
          </span>
        </>
      }
    >
      <DashboardMenuLink href={settingsHref}>Settings &amp; members</DashboardMenuLink>
      <DashboardMenuSeparator />
      <DashboardMenuLogout>Log out</DashboardMenuLogout>
    </DashboardMenu>
  );
}

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, React.ReactNode> = {
    home: <><path d="M3 8.5 10 3l7 5.5" /><path d="M5 7.5V17h10V7.5M8 17v-5h4v5" /></>,
    attention: <><path d="M10 3 2.8 16h14.4L10 3Z" /><path d="M10 7.5v4M10 14h.01" /></>,
    approvals: <><path d="M6 3h8v14H6z" /><path d="M8 7h4M8 10h4M8 13h2" /><path d="M8 3V2h4v1" /></>,
    delegation: <><path d="M4 10h12" /><path d="M10 4v12" /><circle cx="10" cy="10" r="7" /></>,
    logs: <><path d="M4 3h12v14H4z" /><path d="M7 7h6M7 10h6M7 13h4" /></>,
    add: <><circle cx="10" cy="10" r="7" /><path d="M10 6.5v7M6.5 10h7" /></>,
    agents: <><circle cx="10" cy="8" r="3" /><path d="M4.5 17c.8-3.2 2.6-4.8 5.5-4.8s4.7 1.6 5.5 4.8" /></>,
    webhooks: <><circle cx="6" cy="6" r="2.5" /><circle cx="14" cy="8" r="2.5" /><circle cx="9" cy="15" r="2.5" /><path d="m8 6.5 3.5.8M12.5 10l-2 2.8M7.5 12.8 6.8 8.5" /></>,
    settings: <><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" /></>,
    profiles: <><path d="M4 4h12v12H4z" /><path d="M7 7h6M7 10h6M7 13h3" /></>,
    billing: <><path d="M3 5h14v10H3z" /><path d="M3 8h14M6 12h3" /></>,
    docs: <><path d="M5 3h8l2 2v12H5z" /><path d="M13 3v3h3M8 10h4M8 13h4" /></>,
    support: <><circle cx="10" cy="10" r="7" /><path d="M10 13.5h.01M8.2 7.8a1.8 1.8 0 1 1 2.3 2.2c-.4.2-.5.5-.5.9" /></>
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
  effectivePlan = null,
  user = null,
  workspaceSlug: workspaceSlugProp
}: {
  children: React.ReactNode;
  /** Effective plan label for the active workspace (grants included). */
  effectivePlan?: string | null;
  user?: DashboardShellUser | null;
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
    <DashboardOmniSearchProvider>
    <div className="dashboard-shell app-shell" data-content-variant={contentVariant}>
      <aside
        id="dashboard-drawer"
        ref={drawerRef}
        className={`ds dashboard-sidebar app-sidebar${drawerOpen ? " app-sidebar--open" : ""}`}
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

        <WorkspaceSwitcher
          effectivePlan={effectivePlan}
          state={workspaceState}
          workspaceSlug={workspaceSlug}
        />

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

          <section className="dashboard-nav__section dashboard-nav__section--secondary">
            <ul>
              {secondaryNavItems.map((item) => {
                const href = item.external
                  ? item.href
                  : workspaceSlug
                    ? workspaceDashboardHref(workspaceSlug, item.subpath)
                    : `/dashboard${item.subpath}`;
                const active = !item.external && isDashboardNavItemActive(pathname, href);
                return (
                  <li key={item.label}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      href={href}
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
        </nav>

        <div className="app-sidebar__footer">
          <div className="dashboard-sidebar__theme">
            <span>Appearance</span>
            <ThemeToggle />
          </div>
          <UserMenu user={user} workspaceSlug={workspaceSlug} />
        </div>
      </aside>

      <div
        className="dashboard-workspace"
        inert={isMobile && drawerOpen ? true : undefined}
        aria-hidden={isMobile && drawerOpen ? true : undefined}
      >
        <header className="ds dashboard-topbar">
          <nav className="dashboard-breadcrumb" aria-label="Current location">
            <span>{currentItem.group}</span>
            <span aria-hidden="true">/</span>
            <strong aria-current="page">{currentItem.label}</strong>
          </nav>
          <DashboardOmniSearchTrigger variant="bar" />
          <div className="dashboard-topbar__workspace" title={workspaceName}>
            <span className="cx-dot" aria-hidden="true" />
            <span>{workspaceName}</span>
          </div>
        </header>

        <header className="ds app-mobile-topbar">
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
          <DashboardOmniSearchTrigger variant="icon" />
          <Logo href={homeHref} variant="symbol" />
        </header>

        <main
          id="main-content"
          className={`dashboard-main app-main dashboard-main--${contentVariant}`}
          tabIndex={-1}
          aria-busy={workspaceState.switching || undefined}
        >
          <p className="sr-only" aria-live="polite">{currentItem.label}, current page</p>
          {workspaceState.switching ? (
            <DashboardRouteLoading label="Switching workspace" />
          ) : children}
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
    </DashboardOmniSearchProvider>
  );
}
