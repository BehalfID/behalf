"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, ThemeToggle, ModeToggle } from "@/components/ui";

export const docsNav = [
  { href: "/docs",                   label: "Overview"          },
  { href: "/docs/quickstart",        label: "Quickstart"        },
  { href: "/docs/cli",               label: "CLI"               },
  { href: "/docs/deploy-approvals",  label: "Deploy approvals"  },
  { href: "/docs/api",               label: "API"               },
  { href: "/docs/sdk",               label: "SDK"               },
  { href: "/docs/action-gateway",    label: "Action Gateway"    },
  { href: "/docs/webhooks",          label: "Webhooks"          },
  { href: "/docs/site-guard",        label: "Site Guard"        },
  { href: "/docs/concepts",          label: "Concepts"          },
  { href: "/security",               label: "Security"          },
];

const searchIndex = [
  { href: "/docs",                   title: "Overview",          body: "BehalfID connects external agents and native custom agents to scoped permissions, verification decisions, audit logs, and signed webhook events." },
  { href: "/docs/quickstart",        title: "Quickstart",        body: "Create an agent, add a permission, install the SDK, call verify before execution, show allowed and denied requests, and fail closed." },
  { href: "/docs/cli",               title: "CLI",               body: "Install the behalf CLI to manage agents, permissions, and enforcement from the terminal. Includes MCP server setup, AI tool launchers, context generation, and key management." },
  { href: "/docs/deploy-approvals",  title: "Deploy approvals",  body: "Step-by-step demo: Claude Code or Codex attempts a production deploy, BehalfID blocks it, you approve in the dashboard, the agent retries and succeeds." },
  { href: "/docs/api",               title: "API Reference",     body: "Use public REST endpoints for connected agents, permissions, verification, logs, and key rotation. Requires an API key. POST verify, GET agents, PATCH permissions." },
  { href: "/docs/sdk",               title: "SDK",               body: "Install the JavaScript SDK from npm and call BehalfID from Node 18+. Import BehalfID, call verify, and fail closed before running your executor." },
  { href: "/docs/action-gateway",    title: "Action Gateway",    body: "Route safe public web reads through BehalfID so denied actions fail before execution. Proxy HTTP requests with permission enforcement built in." },
  { href: "/docs/webhooks",          title: "Webhooks",          body: "Receive signed verification events through an outbox-backed delivery system. HMAC signatures, retries, payload structure, and endpoint configuration." },
  { href: "/docs/site-guard",        title: "Site Guard",        body: "Design website middleware, workers, or gateways that enforce AI access rules before protected workflows run. Block or challenge agent requests at the edge." },
  { href: "/docs/concepts",          title: "Concepts",          body: "Understand native agents, connected agents, permission passports, providers, and audit logs. Fail-closed enforcement, agent types, scope templates, and constraints." },
  { href: "/security",               title: "Security",          body: "How BehalfID handles secrets, tokens, fail-closed enforcement, audit logs, and current limitations. Key hashing, one-time display, and SSRF protections." },
];

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="5.8" cy="5.8" r="4.2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M9.5 9.5l2.8 2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const HamburgerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function useSearch() {
  const [query, setQuery] = useState("");
  const results = query.trim().length >= 1
    ? searchIndex.filter(({ title, body }) => {
        const q = query.toLowerCase();
        return title.toLowerCase().includes(q) || body.toLowerCase().includes(q);
      })
    : null;
  return { query, setQuery, results };
}

export function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebar = useSearch();
  const drawer  = useSearch();
  const toggleRef = useRef<HTMLButtonElement>(null);

  const currentLabel = docsNav.find(n => n.href === pathname)?.label ?? "Docs";

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    drawer.setQuery("");
    // Return focus to the toggle button
    requestAnimationFrame(() => toggleRef.current?.focus());
  }, [drawer]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, closeDrawer]);

  return (
    <main className="docs-page">

      {/* ── Mobile sticky header ──────────────────────────────── */}
      <header className="docs-mobile-header">
        <Logo />
        <span className="docs-mobile-header__page">{currentLabel}</span>
        <button
          ref={toggleRef}
          className="docs-mobile-header__toggle"
          onClick={() => setDrawerOpen(o => !o)}
          aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={drawerOpen}
          aria-controls="docs-mobile-drawer"
        >
          {drawerOpen ? <CloseIcon /> : <HamburgerIcon />}
        </button>
      </header>

      {/* ── Mobile drawer ─────────────────────────────────────── */}
      {drawerOpen && (
        <div
          id="docs-mobile-drawer"
          className="docs-mobile-drawer"
          role="dialog"
          aria-label="Documentation navigation"
          aria-modal="true"
        >
          {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
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
              onChange={e => drawer.setQuery(e.target.value)}
            />
          </label>

          {drawer.results !== null ? (
            <div className="docs-search__results" role="listbox" aria-label="Search results">
              {drawer.results.length > 0 ? drawer.results.map(r => (
                <Link key={r.href} href={r.href} className="docs-search__result" onClick={closeDrawer}>
                  <strong>{r.title}</strong>
                  <span>{r.body}</span>
                </Link>
              )) : (
                <p className="docs-search__empty" role="status">No results for &ldquo;{drawer.query}&rdquo;</p>
              )}
            </div>
          ) : (
            <nav className="docs-mobile-nav" aria-label="Documentation">
              {docsNav.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeDrawer}
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="docs-mobile-drawer__footer">
            <span id="theme-label">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ───────────────────────────────────── */}
      <aside className="docs-sidebar">
        <Logo />
        <p className="sidebar-label">Developer docs</p>

        <label className="docs-search docs-search--sidebar" htmlFor="docs-search-sidebar">
          <SearchIcon />
          <input
            id="docs-search-sidebar"
            type="search"
            className="docs-search__input"
            placeholder="Search docs…"
            aria-label="Search documentation"
            value={sidebar.query}
            onChange={e => sidebar.setQuery(e.target.value)}
          />
          {sidebar.results !== null && sidebar.results.length > 0 && (
            <div className="docs-search__results docs-search__results--popup" role="listbox" aria-label="Search results">
              {sidebar.results.map(r => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="docs-search__result"
                  onClick={() => sidebar.setQuery("")}
                >
                  <strong>{r.title}</strong>
                  <span>{r.body.slice(0, 80)}…</span>
                </Link>
              ))}
            </div>
          )}
          {sidebar.results !== null && sidebar.results.length === 0 && (
            <p className="docs-search__empty docs-search__empty--inline" role="status">No results</p>
          )}
        </label>

        <nav aria-label="Documentation">
          {docsNav.map(item => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="app-sidebar__footer">
          <ModeToggle />
          <ThemeToggle />
        </div>
      </aside>

      <article id="main-content" className="docs-article" tabIndex={-1}>
        {/* Simple mode banner — visible only when data-mode="simple" via CSS */}
        <div className="simple-mode-banner" role="note" aria-label="Simple mode is active">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
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
