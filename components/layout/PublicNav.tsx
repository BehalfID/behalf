"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo, SplitCTAButton, ThemeToggle, SocialLinks } from "@/components/ui";

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <nav className="public-nav">
        <button
          className="public-nav__hamburger"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
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
          <SocialLinks className="social-links--nav" />
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
        <div className="public-nav__drawer" role="dialog" aria-label="Navigation menu">
          <Link href="/docs" onClick={close}>Docs</Link>
          <Link href="/blog" onClick={close}>Blog</Link>
          <Link href="/security" onClick={close}>Security</Link>
          <Link href="/login" onClick={close}>Log in</Link>
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
