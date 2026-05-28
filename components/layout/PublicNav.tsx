"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Logo, SplitCTAButton, ThemeToggle, ModeToggle, SocialLinks } from "@/components/ui";

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the hamburger button when drawer closes
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }, []);

  // Close on Escape key and implement focus trap while open
  useEffect(() => {
    if (!open) return;

    const el = drawerRef.current;

    // Close on Escape
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }

      // Focus trap: keep Tab cycling within the drawer
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

    // Move focus into the drawer on open
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
          aria-label={open ? "Close menu" : "Open menu"}
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
          <Link href="/docs">Docs</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/security">Security</Link>
          <Link href="/status">Status</Link>
          <SocialLinks className="social-links--nav" />
          <ModeToggle />
          <ThemeToggle />
          <SplitCTAButton
            leftLabel="Build"
            leftHref="/signup"
            rightLabel="Log In"
            rightHref="/login"
            className="split-cta--nav"
          />
        </div>

        {/* Mobile-only CTA: shown when public-nav__links is hidden */}
        <div className="public-nav__mobile-cta">
          <SplitCTAButton
            leftLabel="Build"
            leftHref="/signup"
            rightLabel="Log In"
            rightHref="/login"
            className="split-cta--nav"
          />
        </div>
      </nav>

      {open && (
        <div
          id="public-nav-drawer"
          ref={drawerRef}
          className="public-nav__drawer"
          role="dialog"
          aria-label="Navigation menu"
          aria-modal="true"
        >
          <Link href="/docs" onClick={close}>Docs</Link>
          <Link href="/blog" onClick={close}>Blog</Link>
          <Link href="/security" onClick={close}>Security</Link>
          <Link href="/status" onClick={close}>Status</Link>
          <Link href="/compliance" onClick={close}>Compliance</Link>
          <Link href="/login" onClick={close}>Log in</Link>
          <div className="public-nav__drawer-row">
            <span>Mode</span>
            <ModeToggle />
          </div>
          <div className="public-nav__drawer-row">
            <span>Theme</span>
            <ThemeToggle />
          </div>
          <SocialLinks className="social-links--drawer" />
        </div>
      )}
    </>
  );
}
