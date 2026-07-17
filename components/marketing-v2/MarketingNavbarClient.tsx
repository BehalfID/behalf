"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicAuthAction } from "@/components/layout/PublicAuthAction";
import { ButtonLink, Logo } from "@/components/ui";
import styles from "@/app/home-v2/home-v2.module.css";
import type { PublicAuthAction as PublicAuthActionValue } from "@/lib/publicAuthAction";

const NAV_LINKS = [
  { label: "Product", href: "#product-showcase" },
  { label: "Enterprise", href: "#enterprise" },
  { label: "Security", href: "/security" },
  { label: "Docs", href: "/docs" }
] as const;

export function MarketingNavbarClient({ authAction }: { authAction: PublicAuthActionValue }) {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.nav}>
      <div className={styles.navInner}>
        <Logo className={styles.brand} href="/" markStyle="framed" />

        <nav className={styles.navLinks} aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className={styles.navLink}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className={styles.navActions}>
          <PublicAuthAction action={authAction} className={styles.navSignin} />
          <ButtonLink href="/signup" className={styles.navCta} variant="primary">
            Start securing agents
          </ButtonLink>
        </div>

        <button
          type="button"
          className={styles.hamburger}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="marketing-drawer"
          onClick={() => setOpen((o) => !o)}
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
      </div>

      {open && (
        <div id="marketing-drawer" className={styles.drawer}>
          {NAV_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className={styles.drawerLink} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <div className={styles.drawerActions}>
            <PublicAuthAction
              action={authAction}
              className="ui-button ui-button--outline ui-button--large"
              onClick={() => setOpen(false)}
            />
            <ButtonLink href="/signup" onClick={() => setOpen(false)} size="large" variant="primary">
              Get started
            </ButtonLink>
          </div>
        </div>
      )}
    </header>
  );
}
