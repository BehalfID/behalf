"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { PublicAuthAction } from "@/components/layout/PublicAuthAction";
import { LanguageSwitcher, Logo, ThemeToggle, ModeToggle } from "@/components/ui";
import type { PublicAuthAction as PublicAuthActionValue } from "@/lib/publicAuthAction";
import { DOCS_SEARCH_INDEX, matchSmartSuggestions } from "@/lib/smartSearch";
import { crossAppClickHandler } from "@/lib/subdomainRouting";

type DocsNavItem = {
  href: string;
  labelKey:
    | "overview"
    | "quickstart"
    | "cli"
    | "deployApprovals"
    | "api"
    | "sdk"
    | "actionGateway"
    | "webhooks"
    | "concepts"
    | "troubleshooting"
    | "security"
    | "siteGuard";
};

type DocsNavGroup = {
  labelKey: "navGroupStart" | "navGroupBuild" | "navGroupUnderstand";
  items: readonly DocsNavItem[];
};

const docsNavGroups: readonly DocsNavGroup[] = [
  {
    labelKey: "navGroupStart",
    items: [
      { href: "/docs", labelKey: "overview" },
      { href: "/docs/quickstart", labelKey: "quickstart" },
      { href: "/docs/cli", labelKey: "cli" },
      { href: "/docs/deploy-approvals", labelKey: "deployApprovals" }
    ]
  },
  {
    labelKey: "navGroupBuild",
    items: [
      { href: "/docs/api", labelKey: "api" },
      { href: "/docs/sdk", labelKey: "sdk" },
      { href: "/docs/action-gateway", labelKey: "actionGateway" },
      { href: "/docs/webhooks", labelKey: "webhooks" }
    ]
  },
  {
    labelKey: "navGroupUnderstand",
    items: [
      { href: "/docs/concepts", labelKey: "concepts" },
      { href: "/docs/troubleshooting", labelKey: "troubleshooting" },
      { href: "/security", labelKey: "security" },
      { href: "/docs/site-guard", labelKey: "siteGuard" }
    ]
  }
] as const;

export const docsNav: readonly { href: string; labelKey: DocsNavItem["labelKey"] }[] =
  docsNavGroups.flatMap((group) => [...group.items]);

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
  const results = useMemo(() => {
    if (query.trim().length < 1) return null;
    const suggestions = matchSmartSuggestions(query, { scope: "docs", limit: 12 });
    const byHref = new Map(DOCS_SEARCH_INDEX.map((doc) => [doc.href, doc]));
    return suggestions
      .map((suggestion) => {
        const doc = suggestion.href ? byHref.get(suggestion.href) : undefined;
        if (doc) return doc;
        if (!suggestion.href) return null;
        return { href: suggestion.href, title: suggestion.title, body: suggestion.description };
      })
      .filter((item): item is { href: string; title: string; body: string } => Boolean(item));
  }, [query]);
  return { query, setQuery, results };
}

function DocsNavigation({
  pathname,
  onNavigate,
  t
}: {
  pathname: string;
  onNavigate?: () => void;
  t: ReturnType<typeof useTranslations<"docs">>;
}) {
  return (
    <nav className="docs-nav" aria-label={t("docsNav")}>
      {docsNavGroups.map((group) => (
        <div className="docs-nav__group" key={group.labelKey}>
          <p className="docs-nav__label">{t(group.labelKey)}</p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={crossAppClickHandler(item.href, onNavigate)}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <span>{t(item.labelKey)}</span>
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
  const t = useTranslations("docs");
  const tNav = useTranslations("nav");
  const rawPathname = usePathname();
  const pathname = rawPathname.replace(/^\/(en|de|es|fr)(?=\/|$)/, "") || "/";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebar = useSearch();
  const drawer = useSearch();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const currentLabelKey = docsNav.find((item) => item.href === pathname)?.labelKey;
  const currentLabel = currentLabelKey ? t(currentLabelKey) : t("docsNav");
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
          aria-label={drawerOpen ? t("closeNav") : t("openNav")}
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
            aria-label={t("closeNav")}
            tabIndex={-1}
            onClick={closeDrawer}
          />
          <div
            id="docs-mobile-drawer"
            ref={drawerRef}
            className="docs-mobile-drawer"
            role="dialog"
            aria-label={t("docsNav")}
            aria-modal="true"
          >
            <div className="docs-mobile-drawer__heading">
              <span>{t("developerDocs")}</span>
              <button type="button" onClick={closeDrawer} aria-label={t("closeNav")}><CloseIcon /></button>
            </div>
            <label className="docs-search" htmlFor="docs-search-drawer">
              <SearchIcon />
              <input
                id="docs-search-drawer"
                autoFocus
                type="search"
                className="docs-search__input"
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchLabel")}
                value={drawer.query}
                onChange={(event) => drawer.setQuery(event.target.value)}
              />
            </label>

            {drawer.results !== null ? (
              <div className="docs-search__results" role="listbox" aria-label={t("searchResults")}>
                {drawer.results.length > 0 ? drawer.results.map((result) => (
                  <Link
                    key={result.href}
                    href={result.href}
                    className="docs-search__result"
                    onClick={crossAppClickHandler(result.href, closeDrawer)}
                    role="option"
                    aria-selected="false"
                  >
                    <strong>{result.title}</strong>
                    <span>{result.body}</span>
                  </Link>
                )) : (
                  <p className="docs-search__empty" role="status">{t("noResults", { query: drawer.query })}</p>
                )}
              </div>
            ) : (
              <DocsNavigation pathname={pathname} onNavigate={closeDrawer} t={t} />
            )}

            <div className="docs-mobile-drawer__footer">
              <span>{tNav("theme")}</span>
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </div>
        </>
      ) : null}

      <aside className="docs-sidebar">
        <div className="docs-sidebar__brand">
          <Logo markStyle="framed" />
          <p>{t("developerDocs")}</p>
        </div>

        <label className="docs-search docs-search--sidebar" htmlFor="docs-search-sidebar">
          <SearchIcon />
          <input
            id="docs-search-sidebar"
            type="search"
            className="docs-search__input"
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            value={sidebar.query}
            onChange={(event) => sidebar.setQuery(event.target.value)}
          />
          {sidebar.results !== null && sidebar.results.length > 0 ? (
            <div className="docs-search__results docs-search__results--popup" role="listbox" aria-label={t("searchResults")}>
              {sidebar.results.map((result) => (
                <Link
                  key={result.href}
                  href={result.href}
                  className="docs-search__result"
                  onClick={crossAppClickHandler(result.href, () => sidebar.setQuery(""))}
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
            <p className="docs-search__empty docs-search__empty--inline" role="status">
              {t("noResults", { query: sidebar.query })}
            </p>
          ) : null}
        </label>

        <DocsNavigation pathname={pathname} t={t} />

        <div className="app-sidebar__footer docs-sidebar__footer">
          <ModeToggle />
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </aside>

      <header className="docs-utility-header">
        <p><span>{t("docsNav")}</span><strong>{currentLabel}</strong></p>
        <nav aria-label={t("utilities")}>
          <Link href="/" onClick={crossAppClickHandler("/")}>{t("website")}</Link>
          <Link href="/security" onClick={crossAppClickHandler("/security")}>{t("security")}</Link>
          <Link href="/status" onClick={crossAppClickHandler("/status")}>{tNav("status")}</Link>
          <PublicAuthAction action={authAction} className="docs-utility-header__signin" localizeUnauthenticated />
          <LanguageSwitcher />
        </nav>
      </header>

      <article id="main-content" className="docs-article" tabIndex={-1}>
        <div className="simple-mode-banner" role="note" aria-label={t("simpleModeOn")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 7v4M8 5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>
            <strong>{t("simpleModeOn")}</strong> {t("simpleModeBody")}
            <strong>{t("simpleModeSwitch")}</strong>
            {t("simpleModeSuffix")}
          </span>
        </div>
        {children}
      </article>
    </main>
  );
}
