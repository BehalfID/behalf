"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/design-system/brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";
import { crossAppClickHandler } from "@/lib/subdomainRouting";

/**
 * Lovable marketing header shell.
 * Not yet cut over onto all public pages — missing `/pricing` and
 * `/adaptive-engine` land in Phase 2. Existing `PublicNav` remains default.
 */
const nav = [
  { label: "Product", href: "/#product", primary: true },
  { label: "Adaptive engine", href: "/adaptive-engine", primary: true },
  { label: "Developers", href: "/docs", primary: true },
  { label: "Pricing", href: "/pricing", primary: true },
  { label: "Security", href: "/security", primary: false },
  { label: "Status", href: "/status", primary: false }
] as const;

function normalizePublicPath(pathname: string) {
  const normalized = pathname.replace(/^\/(en|de|es|fr)(?=\/|$)/, "");
  return normalized || "/";
}

export function MarketingHeader({
  signInHref = "/login",
  signUpHref = "/signup",
  className
}: {
  signInHref?: string;
  signUpHref?: string;
  className?: string;
}) {
  const pathname = normalizePublicPath(usePathname());
  const [open, setOpen] = useState(false);

  return (
    <header className={cn("ds-header theme-transition", className)}>
      <div className="ds-header__inner">
        <Wordmark />
        <nav aria-label="Primary" className="ds-header__nav">
          {nav.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={cn("ds-header__link", !item.primary && "ds-header__link--secondary")}
              aria-current={pathname === item.href ? "page" : undefined}
              onClick={crossAppClickHandler(item.href)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ds-header__actions">
          <span className="ds-header__theme">
            <ThemeToggle allowSystem />
          </span>
          <Link
            href={signInHref}
            className="ds-header__ghost"
            onClick={crossAppClickHandler(signInHref)}
          >
            Sign in
          </Link>
          <Link
            href={signUpHref}
            className="ds-header__cta"
            onClick={crossAppClickHandler(signUpHref)}
          >
            Start building
            <span aria-hidden>→</span>
          </Link>
          <button
            type="button"
            className="ds-header__menu-btn"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>
      {open ? (
        <nav aria-label="Mobile" className="ds-header__drawer">
          {nav.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={(event) => {
                setOpen(false);
                crossAppClickHandler(item.href)(event);
              }}
            >
              {item.label}
            </Link>
          ))}
          <div className="hairline-t" style={{ marginTop: "0.75rem", paddingTop: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link href={signInHref} onClick={crossAppClickHandler(signInHref)}>
              Sign in
            </Link>
            <ThemeToggle allowSystem />
          </div>
        </nav>
      ) : null}
    </header>
  );
}
