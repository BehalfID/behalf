"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/design-system/brand";
import { ArrowRight, Menu, X } from "@/components/design-system/icons";
import { LanguageSwitcher } from "@/components/ui";
import { ContinueWithGoogle } from "@/components/auth/ContinueWithGoogle";
import { DsAppearanceToggle } from "@/components/design-system/DsAppearanceToggle";
import { cn } from "@/lib/cn";
import { crossAppClickHandler } from "@/lib/subdomainRouting";
import type { PublicAuthAction } from "@/lib/publicAuthAction";

/** Desktop nav mirrors Lovable; Blog stays mobile/footer-only to preserve density. */
const nav = [
  { label: "Product", href: "/#product", primary: true, desktop: true },
  { label: "Adaptive engine", href: "/adaptive-engine", primary: true, desktop: true },
  { label: "Developers", href: "/docs", primary: true, desktop: true },
  { label: "Pricing", href: "/pricing", primary: true, desktop: true },
  { label: "Security", href: "/security", primary: false, desktop: true },
  { label: "Status", href: "/status", primary: false, desktop: true },
  { label: "Blog", href: "/blog", primary: false, desktop: false }
] as const;

function normalizePublicPath(pathname: string) {
  const normalized = pathname.replace(/^\/(en|de|es|fr)(?=\/|$)/, "");
  return normalized || "/";
}

function isCurrentPath(pathname: string, href: string) {
  if (href.startsWith("/#")) return false;
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function MarketingHeader({
  authAction,
  googleEnabled = false,
  className
}: {
  authAction: PublicAuthAction;
  googleEnabled?: boolean;
  className?: string;
}) {
  const pathname = normalizePublicPath(usePathname());
  const [open, setOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const showGoogle = googleEnabled && !authAction.isAuthenticated;

  function closeDrawer() {
    setOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    const root = document.documentElement;
    root.classList.add("ds-nav-lock");

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => hamburgerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    }

    document.addEventListener("keydown", handleKeyDown);
    drawer?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      root.classList.remove("ds-nav-lock");
    };
  }, [open]);

  const authHref = authAction.href;
  const authLabel = authAction.isAuthenticated ? "Dashboard" : "Sign in";

  return (
    <header className={cn("ds ds-header theme-transition", className)}>
      <div className="ds-header__inner">
        <Wordmark />
        <nav aria-label="Primary" className="ds-header__nav">
          {nav
            .filter((item) => item.desktop)
            .map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn("ds-header__link", !item.primary && "ds-header__link--secondary")}
                aria-current={isCurrentPath(pathname, item.href) ? "page" : undefined}
                onClick={crossAppClickHandler(item.href)}
              >
                {item.label}
              </Link>
            ))}
        </nav>
        <div className="ds-header__actions">
          <span className="ds-header__theme ds-header__theme--locale">
            <LanguageSwitcher />
          </span>
          <span className="ds-header__theme">
            <DsAppearanceToggle />
          </span>
          <Link href={authHref} className="ds-header__ghost" onClick={crossAppClickHandler(authHref)}>
            {authLabel}
          </Link>
          {/* Google OAuth stays on login/signup; keep out of desktop chrome for Lovable density. */}
          {/* Literal Lovable <Button size="sm" className="group rounded-full px-4 shadow-raised"> */}
          <Link
            href="/signup"
            className="group inline-flex h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none"
            onClick={crossAppClickHandler("/signup")}
          >
            Start building
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <button
            ref={hamburgerRef}
            type="button"
            className="ds-header__menu-btn"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="ds-nav-drawer"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
      {open ? (
        <nav id="ds-nav-drawer" ref={drawerRef} aria-label="Mobile" className="ds-header__drawer">
          {nav.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={(event) => {
                closeDrawer();
                crossAppClickHandler(item.href)(event);
              }}
            >
              {item.label}
            </Link>
          ))}
          <div className="hairline-t mt-3 flex flex-wrap items-center justify-between gap-3 pt-4">
            <Link
              href={authHref}
              onClick={(event) => {
                closeDrawer();
                crossAppClickHandler(authHref)(event);
              }}
            >
              {authLabel}
            </Link>
            <DsAppearanceToggle />
          </div>
          {showGoogle ? (
            <ContinueWithGoogle
              label="Continue with Google"
              mode="login"
              onClick={closeDrawer}
              size="large"
              variant="outline"
            />
          ) : null}
          <Link
            href="/signup"
            className="ds-header__cta mt-2 justify-center"
            onClick={(event) => {
              closeDrawer();
              crossAppClickHandler("/signup")(event);
            }}
          >
            Start building
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
