"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PublicAuthAction } from "@/components/layout/PublicAuthAction";
import { Logo, ThemeToggle, ModeToggle } from "@/components/ui";
import type { PublicAuthAction as PublicAuthActionValue } from "@/lib/publicAuthAction";

type DocsNavItem = {
  href: string;
  label: string;
};

type DocsNavGroup = {
  label: string;
  items: readonly DocsNavItem[];
};

const docsNavGroups: readonly DocsNavGroup[] = [
  {
    label: "Start",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/cli", label: "CLI" },
      { href: "/docs/deploy-approvals", label: "Deploy approvals" }
    ]
  },
  {
    label: "Build",
    items: [
      { href: "/docs/api", label: "API" },
      { href: "/docs/sdk", label: "SDK" },
      { href: "/docs/action-gateway", label: "Action Gateway" },
      { href: "/docs/webhooks", label: "Webhooks" }
    ]
  },
  {
    label: "Understand",
    items: [
      { href: "/docs/concepts", label: "Concepts" },
      { href: "/security", label: "Security" },
      { href: "/docs/site-guard", label: "Site Guard" }
    ]
  }
] as const;

export const docsNav: readonly DocsNavItem[] = docsNavGroups.flatMap((group) => [...group.items]);

const searchIndex = [
  { href: "/docs", title: "Overview", body: "BehalfID connects external agents and native custom agents to scoped permissions, verification decisions, audit logs, and signed webhook events." },
  { href: "/docs/quickstart", title: "Quickstart", body: "Create an agent, add a permission, install the SDK, call verify before execution, show allowed and denied requests, and fail closed." },
  { href: "/docs/cli", title: "CLI", body: "Install the behalf CLI to manage agents, permissions, and enforcement from the terminal. Includes MCP server setup, AI tool launchers, context generation, and key management." },
  { href: "/docs/deploy-approvals", title: "Deploy approvals", body: "Step-by-step demo: Claude Code or Codex attempts a production deploy, BehalfID blocks it, you approve in the dashboard, the agent retries and succeeds." },
  { href: "/docs/api", title: "API Reference", body: "Use public REST endpoints for connected agents, permissions, verification, logs, and key rotation. Requires an API key. POST verify, GET agents, PATCH permissions." },
  { href: "/docs/sdk", title: "SDK", body: "Install the JavaScript SDK from npm and call BehalfID from Node 18+. Import BehalfID, call verify, and fail closed before running your executor." },
  { href: "/docs/action-gateway", title: "Action Gateway", body: "Route safe public web reads through BehalfID so denied actions fail before execution. Proxy HTTP requests with permission enforcement built in." },
  { href: "/docs/webhooks", title: "Webhooks", body: "Receive signed verification events through an outbox-backed delivery system. HMAC signatures, retries, payload structure, and endpoint configuration." },
  { href: "/docs/site-guard", title: "Site Guard", body: "Design website middleware, workers, or gateways that enforce AI access rules before protected workflows run. Block or challenge agent requests at the edge." },
  { href: "/docs/concepts", title: "Concepts", body: "Understand native agents, connected agents, permission passports, providers, and audit logs. Fail-closed enforcement, agent types, scope templates, and constraints." },
  { href: "/security", title: "Security", body: "How BehalfID handles secrets, tokens, fail-closed enforcement, audit logs, and current limitations. Key hashing, one-time display, and SSRF protections." }
];

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="5.8" cy="5.8" r="4.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.5 9.5l2.8 2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function useSearch() {
  const [query, setQuery] = useState("");
  const results = query.trim().length >= 1
    ? searchIndex.filter(({ title, body }) => {
        const normalizedQuery = query.toLowerCase();
        return title.toLowerCase().includes(normalizedQuery) || body.toLowerCase().includes(normalizedQuery);
      })
    : null;
  return { query, setQuery, results };
}

function DocsNavigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="docs-nav" aria-label="Documentation">
      {docsNavGroups.map((group) => (
        <div className="docs-nav__group" key={group.label}>
          <p className="docs-nav__label">{group.label}</p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function DocsLayoutClient({
  authAction,
  children
}: {
  authAction: PublicAuthActionValue;
  children: React.ReactNode;
}) {
  const rawPathname = usePathname();
  const pathname = rawPathname.replace(/^\/(en|de|es|fr)(?=\/|$)/, "") || "/";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebar = useSearch();
  const drawer = useSearch();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const currentLabel = docsNav.find((item) => item.href === pathname)?.label ?? "Docs";
  const clearDrawerSearch = drawer.setQuery;

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    clearDrawerSearch("");
    requestAnimationFrame(() => toggleRef.current?.focus());
  }, [clearDrawerSearch]);

  useEffect(() => {
    if (!drawerOpen) return;
    const drawerElement = drawerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer();
        return;
      }
      if (event.key !== "Tab" || !drawerElement) return;

      const focusable = Array.from(
        drawerElement.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
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
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, closeDrawer]);

  return (
    <main className="docs-page">
      <header className={`docs-mobile-header${drawerOpen ? " docs-mobile-header--drawer-open" : ""}`}>
        <Logo markStyle="framed" />
        <span className="docs-mobile-header__page">{currentLabel}</span>
        <button
          ref={toggleRef}
          className="docs-mobile-header__toggle"
          onClick={() => setDrawerOpen((value) => !value)}
          aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={drawerOpen}
          aria-controls="docs-mobile-drawer"
          type="button"
        >
          {drawerOpen ? <CloseIcon /> : <HamburgerIcon />}
        </button>
      </header>

      {drawerOpen ? (
        <>
          <button
            type="button"
            className="docs-mobile-backdrop"
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={closeDrawer}
          />
          <div
            id="docs-mobile-drawer"
            ref={drawerRef}
            className="docs-mobile-drawer"
            role="dialog"
            aria-label="Documentation navigation"
            aria-modal="true"
          >
            <div className="docs-mobile-drawer__heading">
              <span>Developer documentation</span>
              <button type="button" onClick={closeDrawer} aria-label="Close navigation"><CloseIcon /></button>
            </div>
            <label className="docs-search" htmlFor="docs-search-drawer">
              <SearchIcon />
              <input
                id="docs-search-drawer"
                autoFocus
                type="search"
                className="docs-search__input"
                placeholder="Search docs…"
                aria-label="Search documentation"
                value={drawer.query}
                onChange={(event) => drawer.setQuery(event.target.value)}
              />
            </label>

            {drawer.results !== null ? (
              <div className="docs-search__results" role="listbox" aria-label="Search results">
                {drawer.results.length > 0 ? drawer.results.map((result) => (
                  <Link key={result.href} href={result.href} className="docs-search__result" onClick={closeDrawer} role="option" aria-selected="false">
                    <strong>{result.title}</strong>
                    <span>{result.body}</span>
                  </Link>
                )) : (
                  <p className="docs-search__empty" role="status">No results for &ldquo;{drawer.query}&rdquo;</p>
                )}
              </div>
            ) : (
              <DocsNavigation pathname={pathname} onNavigate={closeDrawer} />
            )}

            <div className="docs-mobile-drawer__footer">
              <span>Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </>
      ) : null}

      <aside className="docs-sidebar">
        <div className="docs-sidebar__brand">
          <Logo markStyle="framed" />
          <p>Developer documentation</p>
        </div>

        <label className="docs-search docs-search--sidebar" htmlFor="docs-search-sidebar">
          <SearchIcon />
          <input
            id="docs-search-sidebar"
            type="search"
            className="docs-search__input"
            placeholder="Search docs…"
            aria-label="Search documentation"
            value={sidebar.query}
            onChange={(event) => sidebar.setQuery(event.target.value)}
          />
          {sidebar.results !== null && sidebar.results.length > 0 ? (
            <div className="docs-search__results docs-search__results--popup" role="listbox" aria-label="Search results">
              {sidebar.results.map((result) => (
                <Link
                  key={result.href}
                  href={result.href}
                  className="docs-search__result"
                  onClick={() => sidebar.setQuery("")}
                  role="option"
                  aria-selected="false"
                >
                  <strong>{result.title}</strong>
                  <span>{result.body.slice(0, 80)}…</span>
                </Link>
              ))}
            </div>
          ) : null}
          {sidebar.results !== null && sidebar.results.length === 0 ? (
            <p className="docs-search__empty docs-search__empty--inline" role="status">No results</p>
          ) : null}
        </label>

        <DocsNavigation pathname={pathname} />

        <div className="app-sidebar__footer docs-sidebar__footer">
          <ModeToggle />
          <ThemeToggle />
        </div>
      </aside>

      <header className="docs-utility-header">
        <p><span>Docs</span><strong>{currentLabel}</strong></p>
        <nav aria-label="Documentation utilities">
          <Link href="/">Website</Link>
          <Link href="/security">Security</Link>
          <Link href="/status">Status</Link>
          <PublicAuthAction action={authAction} className="docs-utility-header__signin" />
        </nav>
      </header>

      <article id="main-content" className="docs-article" tabIndex={-1}>
        <div className="simple-mode-banner" role="note" aria-label="Simple mode is active">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 7v4M8 5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>
            <strong>Simple mode on</strong> — some technical details are condensed.{" "}
            Switch to <strong>Dev</strong> in the nav for full API reference.
          </span>
        </div>
        {children}
      </article>
    </main>
  );
}
