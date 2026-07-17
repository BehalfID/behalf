"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { PublicAuthAction } from "@/components/layout/PublicAuthAction";
import { Logo, ThemeToggle, SocialLinks, LanguageSwitcher } from "@/components/ui";
import type { PublicAuthAction as PublicAuthActionValue } from "@/lib/publicAuthAction";

const primaryLinks = [
  { href: "/docs", key: "docs" },
  { href: "/blog", key: "blog" },
  { href: "/security", key: "security" },
  { href: "/status", key: "status" }
] as const;

function normalizePublicPath(pathname: string) {
  const normalized = pathname.replace(/^\/(en|de|es|fr)(?=\/|$)/, "");
  return normalized || "/";
}

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function PublicNavClient({ authAction }: { authAction: PublicAuthActionValue }) {
  const t = useTranslations("nav");
  const pathname = normalizePublicPath(usePathname());
  const [open, setOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;

    const drawer = drawerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }

      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
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
    drawer
      ?.querySelector<HTMLElement>('a[href], button:not([disabled])')
      ?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <header className="public-header">
      <nav className="public-nav" aria-label="Primary">
        <button
          ref={hamburgerRef}
          className="public-nav__hamburger"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? t("closeMenu") : t("openMenu")}
          aria-expanded={open}
          aria-controls="public-nav-drawer"
          type="button"
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <Logo markStyle="framed" />

        <div className="public-nav__links">
          <div className="public-nav__primary">
            {primaryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrentPath(pathname, item.href) ? "page" : undefined}
              >
                {t(item.key)}
              </Link>
            ))}
          </div>
          <LanguageSwitcher />
          <ThemeToggle />
          <div className="public-nav__actions">
            <PublicAuthAction
              action={authAction}
              className="nav-action nav-action--text"
              localizeUnauthenticated
            />
            <Link href="/signup" className="nav-action nav-action--primary">Get started</Link>
          </div>
        </div>

        <div className="public-nav__mobile-cta">
          <Link href="/signup" className="nav-action nav-action--primary">Get started</Link>
        </div>
      </nav>

      {open ? (
        <>
          <button
            type="button"
            className="public-nav__backdrop"
            aria-label={t("closeMenu")}
            tabIndex={-1}
            onClick={close}
          />
          <div
            id="public-nav-drawer"
            ref={drawerRef}
            className="public-nav__drawer"
            role="dialog"
            aria-label={t("navigationMenu")}
            aria-modal="true"
          >
            <div className="public-nav__drawer-heading">
              <span>{t("navigationMenu")}</span>
              <span>BehalfID</span>
            </div>
            {primaryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={isCurrentPath(pathname, item.href) ? "page" : undefined}
              >
                {t(item.key)}
              </Link>
            ))}
            <Link href="/compliance" onClick={close} aria-current={pathname === "/compliance" ? "page" : undefined}>
              {t("compliance")}
            </Link>
            <PublicAuthAction
              action={
                authAction.isAuthenticated
                  ? authAction
                  : { ...authAction, label: t("login") }
              }
              localizeUnauthenticated
              onClick={close}
            />
            <Link href="/signup" onClick={close} className="public-nav__drawer-cta">Get started</Link>
            <div className="public-nav__drawer-row">
              <span>{t("theme")}</span>
              <ThemeToggle />
            </div>
            <div className="public-nav__drawer-row">
              <span>{t("language")}</span>
              <LanguageSwitcher />
            </div>
            <SocialLinks className="social-links--drawer" />
          </div>
        </>
      ) : null}
    </header>
  );
}
