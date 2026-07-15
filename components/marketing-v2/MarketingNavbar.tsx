"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import styles from "@/app/home-v2/home-v2.module.css";

const NAV_LINKS = [
  { label: "Product", href: "#how-it-works" },
  { label: "Developers", href: "#developers" },
  { label: "Security", href: "/security" },
  { label: "Docs", href: "/docs" }
] as const;

export function MarketingNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.nav}>
      <div className={styles.navInner}>
        <Link href="/home-v2" className={styles.brand} aria-label="BehalfID home">
          <span className={styles.brandMark}>
            <Image src="/icon-transparent.png" alt="" width={20} height={20} />
          </span>
          <span>
            Behalf<span className={styles.brandSlash}>/</span>
            <span className={styles.brandId}>ID</span>
          </span>
        </Link>

        <nav className={styles.navLinks} aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className={styles.navLink}>
              {l.label}
            </Link>
          ))}
          {/* Pricing has no dedicated route yet — shown as non-interactive in preview */}
          <span className={styles.navDisabled} aria-disabled="true" title="Pricing page not available in preview">
            Pricing
          </span>
        </nav>

        <div className={styles.navActions}>
          <Link href="/login" className={styles.navSignin}>
            Sign in
          </Link>
          <Link href="/signup" className={`${styles.btnPrimary} ${styles.navCta}`}>
            Start securing agents
          </Link>
        </div>

        <button
          type="button"
          className={styles.hamburger}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="v2-drawer"
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
        <div id="v2-drawer" className={styles.drawer}>
          {NAV_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className={styles.drawerLink} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <div className={styles.drawerActions}>
            <Link href="/login" className={`${styles.btnSecondary}`} onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href="/signup" className={`${styles.btnPrimary}`} onClick={() => setOpen(false)}>
              Get started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
