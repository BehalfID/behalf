"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, ThemeToggle } from "@/components/ui";

export const docsNav = [
  { href: "/docs",                 label: "Overview"       },
  { href: "/docs/quickstart",      label: "Quickstart"     },
  { href: "/docs/cli",             label: "CLI"            },
  { href: "/docs/api",             label: "API"            },
  { href: "/docs/sdk",             label: "SDK"            },
  { href: "/docs/action-gateway",  label: "Action Gateway" },
  { href: "/docs/webhooks",        label: "Webhooks"       },
  { href: "/docs/site-guard",      label: "Site Guard"     },
  { href: "/docs/concepts",        label: "Concepts"       },
  { href: "/security",             label: "Security"       },
];

const searchIndex = [
  { href: "/docs",                 title: "Overview",        body: "BehalfID connects external agents and native custom agents to scoped permissions, verification decisions, audit logs, and signed webhook events." },
  { href: "/docs/quickstart",      title: "Quickstart",      body: "Test with an existing agent in manual mode, or enforce permissions from your own app with the SDK. Create a native or connected agent, define a permission passport, and verify an action." },
  { href: "/docs/cli",             title: "CLI",             body: "Install the behalf CLI to manage agents, permissions, and enforcement from the terminal. Includes MCP server setup, AI tool launchers, context generation, and key management." },
  { href: "/docs/api",             title: "API Reference",   body: "Use public REST endpoints for connected agents, permissions, verification, logs, and key rotation. Requires an API key. POST verify, GET agents, PATCH permissions." },
  { href: "/docs/sdk",             title: "SDK",             body: "Install the JavaScript SDK from npm and call BehalfID from Node 18+. Import BehalfID, call enforceAction to fail closed before running your executor." },
  { href: "/docs/action-gateway",  title: "Action Gateway",  body: "Route safe public web reads through BehalfID so denied actions fail before execution. Proxy HTTP requests with permission enforcement built in." },
  { href: "/docs/webhooks",        title: "Webhooks",        body: "Receive signed verification events through an outbox-backed delivery system. HMAC signatures, retries, payload structure, and endpoint configuration." },
  { href: "/docs/site-guard",      title: "Site Guard",      body: "Design website middleware, workers, or gateways that enforce AI access rules before protected workflows run. Block or challenge agent requests at the edge." },
  { href: "/docs/concepts",        title: "Concepts",        body: "Understand native agents, connected agents, permission passports, providers, and audit logs. Fail-closed enforcement, agent types, scope templates, and constraints." },
  { href: "/security",             title: "Security",        body: "How BehalfID handles secrets, tokens, fail-closed enforcement, audit logs, and current limitations. Key hashing, one-time display, and SSRF protections." },
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

  const currentLabel = docsNav.find(n => n.href === pathname)?.label ?? "Docs";

  const closeDrawer = () => {
    setDrawerOpen(false);
    drawer.setQuery("");
  };

  return (
    <main className="docs-page">

      {/* ── Mobile sticky header ──────────────────────────────── */}
      <header className="docs-mobile-header">
        <Logo />
        <span className="docs-mobile-header__page">{currentLabel}</span>
        <button
          className="docs-mobile-header__toggle"
          onClick={() => setDrawerOpen(o => !o)}
          aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={drawerOpen}
        >
          {drawerOpen ? <CloseIcon /> : <HamburgerIcon />}
        </button>
      </header>

      {/* ── Mobile drawer ─────────────────────────────────────── */}
      {drawerOpen && (
        <div className="docs-mobile-drawer">
          <label className="docs-search">
            <SearchIcon />
            <input
              autoFocus
              type="search"
              className="docs-search__input"
              placeholder="Search docs…"
              value={drawer.query}
              onChange={e => drawer.setQuery(e.target.value)}
            />
          </label>

          {drawer.results !== null ? (
            <div className="docs-search__results">
              {drawer.results.length > 0 ? drawer.results.map(r => (
                <Link key={r.href} href={r.href} className="docs-search__result" onClick={closeDrawer}>
                  <strong>{r.title}</strong>
                  <span>{r.body}</span>
                </Link>
              )) : (
                <p className="docs-search__empty">No results for &ldquo;{drawer.query}&rdquo;</p>
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
            <span>Theme</span>
            <ThemeToggle />
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ───────────────────────────────────── */}
      <aside className="docs-sidebar">
        <Logo />
        <p className="sidebar-label">Developer docs</p>

        <label className="docs-search docs-search--sidebar">
          <SearchIcon />
          <input
            type="search"
            className="docs-search__input"
            placeholder="Search docs…"
            value={sidebar.query}
            onChange={e => sidebar.setQuery(e.target.value)}
          />
          {sidebar.results !== null && sidebar.results.length > 0 && (
            <div className="docs-search__results docs-search__results--popup">
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
            <p className="docs-search__empty docs-search__empty--inline">No results</p>
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
          <ThemeToggle />
        </div>
      </aside>

      <article className="docs-article">{children}</article>
    </main>
  );
}
