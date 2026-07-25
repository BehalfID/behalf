"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, ThemeToggle } from "@/components/ui";

type NavIconName =
  | "home"
  | "agents"
  | "sites"
  | "webhooks"
  | "events"
  | "logs"
  | "status"
  | "enterprise"
  | "settings";

type ContentVariant = "standard" | "wide" | "detail";

const consoleNavSections = [
  {
    label: "Operations",
    items: [
      { href: "/console", label: "Home", icon: "home" as const },
      { href: "/console/logs", label: "Audit logs", icon: "logs" as const },
      { href: "/console/status", label: "Status page", icon: "status" as const },
      { href: "/console/enterprise-inquiries", label: "Enterprise", icon: "enterprise" as const }
    ]
  },
  {
    label: "Agents & access",
    items: [
      { href: "/console/agents", label: "Agents", icon: "agents" as const },
      { href: "/console/site-guard", label: "Site Guard", icon: "sites" as const },
      { href: "/console/webhooks", label: "Webhooks", icon: "webhooks" as const },
      { href: "/console/webhook-events", label: "Event queue", icon: "events" as const }
    ]
  },
  {
    label: "Console",
    items: [
      { href: "/console/settings", label: "Settings", icon: "settings" as const }
    ]
  }
] as const satisfies ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ href: string; label: string; icon: NavIconName }>;
}>;

function isConsoleNavItemActive(pathname: string, href: string) {
  return href === "/console" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function getConsoleContentVariant(pathname: string): ContentVariant {
  if (pathname === "/console/logs") return "wide";
  if (
    /^\/console\/agents\/[^/]+$/.test(pathname) ||
    /^\/console\/webhooks\/[^/]+$/.test(pathname) ||
    /^\/console\/webhook-events\/[^/]+$/.test(pathname)
  ) {
    return "detail";
  }
  return "standard";
}

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, React.ReactNode> = {
    home: <><path d="M3 8.5 10 3l7 5.5" /><path d="M5 7.5V17h10V7.5M8 17v-5h4v5" /></>,
    agents: <><circle cx="10" cy="8" r="3" /><path d="M4.5 17c.8-3.2 2.6-4.8 5.5-4.8s4.7 1.6 5.5 4.8" /></>,
    sites: <><path d="M4 4h12v12H4z" /><path d="M7 7h6M7 10h6M7 13h3" /></>,
    webhooks: <><circle cx="6" cy="6" r="2.5" /><circle cx="14" cy="8" r="2.5" /><circle cx="9" cy="15" r="2.5" /><path d="m8 6.5 3.5.8M12.5 10l-2 2.8M7.5 12.8 6.8 8.5" /></>,
    events: <><path d="M4 3h12v14H4z" /><path d="M7 7h6M7 10h6M7 13h4" /></>,
    logs: <><path d="M4 3h12v14H4z" /><path d="M7 7h6M7 10h6M7 13h4" /></>,
    status: <><circle cx="10" cy="10" r="7" /><path d="M10 6.5v4.2L12.5 13" /></>,
    enterprise: <><path d="M4 16V5h5v11M9 8h7v8M6.5 8v.01M6.5 11v.01M11.5 11v.01M14.5 11v.01M11.5 14v.01M14.5 14v.01" /></>,
    settings: <><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" /></>
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

export function ConsoleShellLayout({
  children,
  onLogout
}: {
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const isMobile = useMobileShell();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const contentVariant = useMemo(() => getConsoleContentVariant(pathname), [pathname]);

  const currentItem = useMemo(() => {
    for (const section of consoleNavSections) {
      const item = section.items.find((candidate) => isConsoleNavItemActive(pathname, candidate.href));
      if (item) return { group: section.label, label: item.label };
    }
    return { group: "Console", label: "Dashboard" };
  }, [pathname]);

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
    <div className="dashboard-shell console-shell app-shell" data-content-variant={contentVariant}>
      <aside
        id="console-drawer"
        ref={drawerRef}
        className={`dashboard-sidebar console-sidebar app-sidebar${drawerOpen ? " app-sidebar--open" : ""}`}
        aria-hidden={isMobile && !drawerOpen ? true : undefined}
        aria-label={isMobile ? "Console navigation" : undefined}
        aria-modal={isMobile && drawerOpen ? true : undefined}
        inert={isMobile && !drawerOpen ? true : undefined}
        role={isMobile ? "dialog" : undefined}
      >
        <div className="dashboard-sidebar__brand">
          <Logo href="/console" markStyle="framed" subtitle="Internal console" />
          <button className="app-drawer-close" onClick={closeDrawer} aria-label="Close navigation" type="button">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 3l12 12M15 3 3 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="workspace-switcher" aria-label="Console context">
          <span className="workspace-switcher__eyebrow">Environment</span>
          <strong className="workspace-switcher__name">Internal admin</strong>
          <small className="workspace-switcher__role">BehalfID console</small>
        </div>

        <nav className="dashboard-nav" aria-label="Console">
          {consoleNavSections.map((section, sectionIndex) => {
            const labelId = `console-nav-section-${sectionIndex}`;
            return (
              <section className="dashboard-nav__section" aria-labelledby={labelId} key={section.label}>
                <p className="app-sidebar__section-label" id={labelId}>{section.label}</p>
                <ul>
                  {section.items.map((item) => {
                    const active = isConsoleNavItemActive(pathname, item.href);
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
          <button className="ui-button ui-button--secondary app-sidebar__logout" onClick={onLogout} type="button">
            Log out
          </button>
        </div>
      </aside>

      <div
        className="dashboard-workspace console-workspace"
        inert={isMobile && drawerOpen ? true : undefined}
        aria-hidden={isMobile && drawerOpen ? true : undefined}
      >
        <header className="dashboard-topbar">
          <nav className="dashboard-breadcrumb" aria-label="Current location">
            <span>{currentItem.group}</span>
            <span aria-hidden="true">/</span>
            <strong aria-current="page">{currentItem.label}</strong>
          </nav>
          <div className="dashboard-topbar__workspace" title="Internal admin">
            <span className="cx-dot" aria-hidden="true" />
            <span>Internal admin</span>
          </div>
        </header>

        <header className="app-mobile-topbar">
          <button
            ref={hamburgerRef}
            className="app-mobile-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="console-drawer"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
          <div className="app-mobile-topbar__context">
            <strong>{currentItem.label}</strong>
            <span>Internal admin</span>
          </div>
          <Logo href="/console" variant="symbol" />
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
