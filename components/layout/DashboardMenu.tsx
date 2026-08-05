"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";

/**
 * Sidebar menu primitive for the dashboard chrome.
 *
 * Ported from the Lovable dashboard shell's workspace switcher and user menu
 * (`agent-gatekeeper-suite/src/components/layouts/dashboard-shell.tsx`), which
 * use a Radix `DropdownMenu`. Radix is not a production dependency, and adding
 * one for two menus is not worth the bundle, so this follows the disclosure
 * pattern the rest of production already uses (`components/ui/Overlay.tsx`
 * `Dropdown`) rather than introducing a third interaction model.
 *
 * `<details>` gives us the open/close state, keyboard activation and
 * screen-reader semantics for free. What it does not give us is dismissal, so
 * Escape and outside-pointer handling are added here — without them a menu
 * opened on a touch device can only be closed by hitting the trigger again.
 */
export function DashboardMenu({
  align = "start",
  children,
  className,
  label,
  trigger
}: {
  align?: "start" | "end";
  children: ReactNode;
  className?: string;
  /** Accessible name for the trigger. */
  label: string;
  trigger: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const close = () => element.removeAttribute("open");

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !element.open) return;
      event.preventDefault();
      close();
      element.querySelector<HTMLElement>("summary")?.focus();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!element.open) return;
      if (event.target instanceof Node && element.contains(event.target)) return;
      close();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <details className={`dashboard-menu${className ? ` ${className}` : ""}`} ref={ref}>
      <summary aria-label={label} className="dashboard-menu__trigger">
        {trigger}
        <svg
          aria-hidden="true"
          className="dashboard-menu__chevron"
          fill="none"
          viewBox="0 0 16 16"
        >
          <path
            d="m5 6.5 3 3 3-3"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </svg>
      </summary>
      <div
        className={`dashboard-menu__content dashboard-menu__content--${align}`}
        role="menu"
      >
        {children}
      </div>
    </details>
  );
}

export function DashboardMenuLabel({ children }: { children: ReactNode }) {
  return <p className="dashboard-menu__label">{children}</p>;
}

export function DashboardMenuSeparator() {
  return <hr className="dashboard-menu__separator" />;
}

function closeEnclosingMenu(target: HTMLElement) {
  target.closest("details")?.removeAttribute("open");
}

export function DashboardMenuItem({
  children,
  disabled,
  onSelect,
  selected
}: {
  children: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
  selected?: boolean;
}) {
  return (
    <button
      aria-checked={selected}
      className="dashboard-menu__item"
      disabled={disabled}
      onClick={(event) => {
        closeEnclosingMenu(event.currentTarget);
        onSelect();
      }}
      role="menuitemradio"
      type="button"
    >
      {children}
    </button>
  );
}

export function DashboardMenuLink({
  children,
  href
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className="dashboard-menu__item"
      href={href}
      onClick={(event) => closeEnclosingMenu(event.currentTarget)}
      role="menuitem"
    >
      {children}
    </Link>
  );
}

/**
 * Anchor rather than `Link`: the logout GET route clears the session server-side
 * before redirecting, so a client-side navigation would keep the stale tree.
 */
export function DashboardMenuLogout({ children }: { children: ReactNode }) {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a className="dashboard-menu__item dashboard-menu__item--danger" href="/logout" role="menuitem">
      {children}
    </a>
  );
}
