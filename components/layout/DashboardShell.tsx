"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DsAppearanceToggle } from "@/components/design-system/DsAppearanceToggle";
import { DashboardRouteLoading } from "@/components/dashboard/DashboardRouteLoading";
import {
  DashboardOmniSearchProvider,
  DashboardOmniSearchTrigger
} from "@/components/dashboard/DashboardOmniSearch";
import { useDashboardApi, useOptionalWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  DashboardMenu,
  DashboardMenuItem,
  DashboardMenuLabel,
  DashboardMenuLink,
  DashboardMenuLogout,
  DashboardMenuSeparator
} from "@/components/layout/DashboardMenu";
import { ShellNavIcon, type ShellIconName } from "@/components/layout/ShellNavIcon";
import {
  extractDashboardSubpath,
  workspaceDashboardHref,
  workspaceApiHref
} from "@/lib/workspaceSlug";
import { isDashboardNavItemActive, workspaceInitials } from "@/lib/dashboardShellPresentation";
// `identifyUser` joins this session to the account; `resetIdentity` clears the
// analytics person on sign-out so the next visitor on this device starts
// anonymous. Both are no-ops when analytics never initialised (consent declined).
import { identifyUser, resetIdentity } from "@/lib/analytics/identity";
import "./dashboard-chrome.css";

/**
 * Navigation grouped as in the Lovable reference: a standalone Overview row,
 * then OPERATE and WORKSPACE. Every subpath is a real production route — see
 * docs/LOVABLE_UI_MIGRATION.md for the label mapping, including the reference
 * labels that have no production page.
 */
type NavItem = { subpath: string; label: string; icon: ShellIconName };
type NavGroup = { label: string; items: ReadonlyArray<NavItem> };

const overviewItem: NavItem = { subpath: "", label: "Overview", icon: "overview" };

const navGroups: ReadonlyArray<NavGroup> = [
  {
    label: "Operate",
    items: [
      { subpath: "/agents", label: "Agents", icon: "agents" },
      { subpath: "/approvals", label: "Approvals", icon: "approvals" },
      { subpath: "/inbox", label: "Needs attention", icon: "attention" },
      { subpath: "/logs", label: "Activity", icon: "activity" },
      { subpath: "/adaptive-delegation", label: "Adaptive delegation", icon: "delegation" },
      { subpath: "/managed-profiles", label: "Managed profiles", icon: "profiles" },
      { subpath: "/webhooks", label: "Webhooks", icon: "webhooks" }
    ]
  },
  {
    label: "Workspace",
    items: [
      { subpath: "/billing", label: "Usage & billing", icon: "billing" },
      { subpath: "/settings", label: "Settings & members", icon: "settings" }
    ]
  }
] satisfies ReadonlyArray<NavGroup>;

/** Utility links. Status is a public, host-neutral page. */
const utilityItems = [
  { subpath: "/docs", label: "Documentation", icon: "docs" as ShellIconName, external: false },
  { href: "/status", label: "Status & support", icon: "support" as ShellIconName, external: true }
] as const;

export type DashboardShellUser = {
  /**
   * Stable internal user id — the same value the server sends to analytics, and
   * what joins a signed-in session to the anonymous browsing that preceded it.
   * Never an email or a session token.
   */
  userId: string;
  name: string;
  email: string;
  initials: string;
};

export type DashboardShellUsage = {
  used: number | null;
  limit: number | null;
  percent: number | null;
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

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function WorkspaceSelector({
  effectivePlan,
  state,
  workspaceSlug
}: {
  effectivePlan: string | null;
  state: WorkspaceState;
  workspaceSlug: string | null;
}) {
  const fallbackName = workspaceSlug
    ? workspaceSlug.split("-").map(titleCase).join(" ")
    : "Workspace";
  const name = state.activeAccount?.name ?? fallbackName;
  const role = state.activeAccount?.role ?? null;
  // Plan is known only for the active workspace, so it is never guessed for the
  // others in the list.
  const descriptor = [effectivePlan ? titleCase(effectivePlan) : null, role ? titleCase(role) : null]
    .filter(Boolean)
    .join(" · ");

  const identity = (
    <>
      <span aria-hidden="true" className="shell-workspace__mark">
        {workspaceInitials(name).slice(0, 1)}
      </span>
      <span className="shell-workspace__text">
        <span className="shell-workspace__name" title={name}>{name}</span>
        {descriptor ? <span className="shell-workspace__meta">{descriptor}</span> : null}
      </span>
    </>
  );

  // One workspace means nothing to switch to; a menu that can only ever contain
  // the workspace you are already in is a control that does nothing.
  if (state.accounts.length <= 1) {
    return (
      <div className="shell-workspace" aria-busy={!state.loaded || state.switching}>
        <div className="shell-workspace__static">{identity}</div>
      </div>
    );
  }

  return (
    <div className="shell-workspace" aria-busy={!state.loaded || state.switching}>
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
            <span className="dashboard-menu__item-meta">{titleCase(account.role)}</span>
          </DashboardMenuItem>
        ))}
      </DashboardMenu>
    </div>
  );
}

/**
 * Plan usage card.
 *
 * Every value is real: the plan is the effective plan, so a grant is never shown
 * as free, and the counters come from the account row the layout already read —
 * no extra query and no invented number. When a counter cannot be resolved the
 * card says so instead of vanishing without explanation.
 */
function PlanUsageCard({
  billingHref,
  complimentary,
  plan,
  usage
}: {
  billingHref: string;
  complimentary: boolean;
  plan: string | null;
  usage: DashboardShellUsage | null;
}) {
  if (!plan) return null;

  const counted =
    usage != null && usage.used !== null && usage.limit !== null && usage.percent !== null;
  const unlimited = usage != null && usage.used !== null && usage.limit === null;

  return (
    <Link className="shell-plan" href={billingHref}>
      <span className="shell-plan__head">
        <span className="shell-plan__name">
          {titleCase(plan)} plan
          {complimentary ? <span className="shell-plan__badge">Complimentary</span> : null}
        </span>
        {counted ? <span className="shell-plan__percent">{usage.percent}%</span> : null}
      </span>
      {counted ? (
        <span className="shell-plan__track">
          <span className="shell-plan__fill" style={{ width: `${usage.percent}%` }} />
        </span>
      ) : null}
      <span className="shell-plan__detail">
        {counted
          ? `${usage.used!.toLocaleString()} / ${usage.limit!.toLocaleString()} verifications`
          : unlimited
            ? `${usage.used!.toLocaleString()} verifications · unlimited`
            : "Usage unavailable"}
      </span>
    </Link>
  );
}

function UserFooter({
  settingsHref,
  user
}: {
  settingsHref: string;
  user: DashboardShellUser | null;
}) {
  if (!user) {
    return (
      <div className="shell-user">
        {/* A document navigation is intentional: the GET route clears the session. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="shell-cta" href="/logout" onClick={() => resetIdentity()}>
          Log out
        </a>
      </div>
    );
  }

  return (
    <div className="shell-user">
      <DashboardMenu
        align="end"
        label="Account menu"
        trigger={
          <>
            <span aria-hidden="true" className="shell-user__avatar">{user.initials}</span>
            <span className="shell-user__text">
              <span className="shell-user__name" title={user.name}>{user.name}</span>
              <span className="shell-user__email" title={user.email}>{user.email}</span>
            </span>
          </>
        }
      >
        <DashboardMenuLink href={settingsHref}>Settings &amp; members</DashboardMenuLink>
        <DashboardMenuSeparator />
        <DashboardMenuLogout>Log out</DashboardMenuLogout>
      </DashboardMenu>
    </div>
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
  canMutate = false,
  children,
  effectivePlan = null,
  planIsComplimentary = false,
  usage = null,
  user = null,
  workspaceSlug: workspaceSlugProp
}: {
  /** Whether this actor may mutate the workspace. Viewers may not. */
  canMutate?: boolean;
  children: React.ReactNode;
  effectivePlan?: string | null;
  planIsComplimentary?: boolean;
  usage?: DashboardShellUsage | null;
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

  // Identify from the shell rather than only at the moment of sign-in. The
  // credential form can identify what it just created, but OAuth and passkey
  // sign-ins come back through a redirect with no client-side success handler,
  // and a returning visitor with a live session cookie never touches the form at
  // all. Doing it here covers every way of arriving, and setIdentity is
  // idempotent, so re-running it per session costs nothing.
  const userId = user?.userId ?? null;
  const userEmail = user?.email ?? null;
  const userName = user?.name ?? null;
  useEffect(() => {
    if (!userId) return;
    identifyUser({
      userId,
      email: userEmail,
      name: userName,
      plan: effectivePlan
    });
  }, [userId, userEmail, userName, effectivePlan]);

  const href = useCallback(
    (subpath: string) =>
      workspaceSlug ? workspaceDashboardHref(workspaceSlug, subpath) : `/dashboard${subpath}`,
    [workspaceSlug]
  );

  const groups = useMemo(
    () =>
      navGroups.map((group) => ({
        label: group.label,
        items: group.items.map((item) => ({ ...item, href: href(item.subpath) }))
      })),
    [href]
  );

  const overviewHref = href(overviewItem.subpath);
  const currentLabel =
    [overviewItem, ...navGroups.flatMap((group) => group.items)].find((item) =>
      isDashboardNavItemActive(pathname, href(item.subpath))
    )?.label ?? "Dashboard";

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
        'a[href], button:not([disabled]), summary, select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    el?.querySelector<HTMLElement>("a[href]")?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeDrawer, drawerOpen, isMobile]);

  useEffect(() => {
    const lock = drawerOpen && isMobile;
    document.body.style.overflow = lock ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen, isMobile]);

  const navLink = (item: { href: string; label: string; icon: ShellIconName }) => {
    const active = isDashboardNavItemActive(pathname, item.href);
    return (
      <li key={item.href}>
        <Link
          aria-current={active ? "page" : undefined}
          href={item.href}
          onClick={isMobile ? closeDrawer : undefined}
        >
          <ShellNavIcon name={item.icon} />
          <span>{item.label}</span>
          {active ? <span className="sr-only">, current page</span> : null}
        </Link>
      </li>
    );
  };

  return (
    <DashboardOmniSearchProvider>
      <div className="shell dashboard-shell">
        <aside
          className="ds shell-sidebar"
          data-open={drawerOpen ? "true" : "false"}
          id="dashboard-drawer"
          ref={drawerRef}
          aria-hidden={isMobile && !drawerOpen ? true : undefined}
          aria-label={isMobile ? "Dashboard navigation" : undefined}
          aria-modal={isMobile && drawerOpen ? true : undefined}
          inert={isMobile && !drawerOpen ? true : undefined}
          role={isMobile ? "dialog" : undefined}
        >
          <Link className="shell-brand" href={overviewHref}>
            Behalf<span aria-hidden="true" className="shell-brand__slash">/</span>
            <span className="shell-brand__id">ID</span>
          </Link>

          <WorkspaceSelector
            effectivePlan={effectivePlan}
            state={workspaceState}
            workspaceSlug={workspaceSlug}
          />

          <nav className="shell-nav" aria-label="Dashboard">
            <ul>{navLink({ ...overviewItem, href: overviewHref })}</ul>

            {groups.map((group) => (
              <section className="shell-nav__group" key={group.label}>
                <p className="shell-nav__label">{group.label}</p>
                <ul>{group.items.map(navLink)}</ul>
              </section>
            ))}

            <section className="shell-nav__group shell-nav__utility">
              <ul>
                {utilityItems.map((item) =>
                  navLink({
                    href: item.external ? item.href : href(item.subpath),
                    label: item.label,
                    icon: item.icon
                  })
                )}
              </ul>
            </section>
          </nav>

          <PlanUsageCard
            billingHref={href("/billing")}
            complimentary={planIsComplimentary}
            plan={effectivePlan}
            usage={usage}
          />

          <UserFooter settingsHref={href("/settings")} user={user} />
        </aside>

        <div className="shell-body">
          <header className="ds shell-topbar">
            <DashboardOmniSearchTrigger variant="bar" />
            <div className="shell-actions">
              <Link aria-label="Needs attention" className="shell-iconbutton" href={href("/inbox")}>
                <ShellNavIcon name="bell" />
              </Link>
              <DsAppearanceToggle />
              {/* Hidden for viewers: the API would reject the mutation anyway. */}
              {canMutate ? (
                <Link className="shell-cta" href={href("/onboarding")}>Add agent</Link>
              ) : null}
            </div>
          </header>

          <header className="ds shell-mobilebar">
            <button
              ref={hamburgerRef}
              className="shell-iconbutton app-mobile-hamburger"
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
            <span className="shell-mobilebar__title">{currentLabel}</span>
            <DashboardOmniSearchTrigger variant="icon" />
          </header>

          <main
            id="main-content"
            className="shell-main app-main"
            tabIndex={-1}
            aria-busy={workspaceState.switching || undefined}
          >
            <p className="sr-only" aria-live="polite">{currentLabel}, current page</p>
            {workspaceState.switching ? (
              <DashboardRouteLoading label="Switching workspace" />
            ) : children}
          </main>
        </div>

        {drawerOpen && isMobile ? (
          <button
            className="shell-backdrop"
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
