"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo, ThemeToggle, ModeToggle, SocialLinks, LanguageSwitcher } from "@/components/ui";

export function PublicNav() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;

    const el = drawerRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }

      if (e.key !== "Tab" || !el) return;
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

    const firstFocusable = el?.querySelector<HTMLElement>(
      'a[href], button:not([disabled])'
    );
    firstFocusable?.focus();

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  return (
    <>
      <nav className="public-nav">
        <button
          ref={hamburgerRef}
          className="public-nav__hamburger"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? t("closeMenu") : t("openMenu")}
          aria-expanded={open}
          aria-controls="public-nav-drawer"
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

        <Logo />

        <div className="public-nav__links">
          <Link href="/docs">{t("docs")}</Link>
          <Link href="/blog">{t("blog")}</Link>
          <Link href="/security">{t("security")}</Link>
          <Link href="/status">{t("status")}</Link>
          <LanguageSwitcher />
          <ModeToggle />
          <ThemeToggle />
          <div className="public-nav__actions">
            <Link href="/login" className="nav-action nav-action--ghost">{t("login")}</Link>
            <Link href="/signup" className="nav-action nav-action--primary">{t("build")}</Link>
          </div>
        </div>

        {/* Mobile-only CTA: shown when public-nav__links is hidden */}
        <div className="public-nav__mobile-cta">
          <Link href="/signup" className="nav-action nav-action--primary">{t("build")}</Link>
        </div>
      </nav>

      {open && (
        <div
          id="public-nav-drawer"
          ref={drawerRef}
          className="public-nav__drawer"
          role="dialog"
          aria-label={t("navigationMenu")}
          aria-modal="true"
        >
          <Link href="/docs" onClick={close}>{t("docs")}</Link>
          <Link href="/blog" onClick={close}>{t("blog")}</Link>
          <Link href="/security" onClick={close}>{t("security")}</Link>
          <Link href="/status" onClick={close}>{t("status")}</Link>
          <Link href="/compliance" onClick={close}>{t("compliance")}</Link>
          <Link href="/login" onClick={close}>{t("login")}</Link>
          <div className="public-nav__drawer-row">
            <span>{t("mode")}</span>
            <ModeToggle />
          </div>
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
      )}
    </>
  );
}
