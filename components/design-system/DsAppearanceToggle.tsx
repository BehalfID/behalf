"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  applyThemePreference,
  readThemePreference,
  serverThemePreference,
  subscribeToThemeChanges,
  syncThemeFromPreference,
  type ThemePreference
} from "@/lib/theme";
import { cn } from "@/lib/cn";

type Mode = ThemePreference;

const options: { value: Mode; label: string; icon: "sun" | "moon" | "monitor" }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" }
];

function Icon({ name }: { name: "sun" | "moon" | "monitor" }) {
  if (name === "moon") {
    return (
      <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 16 16">
        <path
          d="M13.5 9A5.5 5.5 0 0 1 7 2.5a5.5 5.5 0 1 0 6.5 6.5z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  if (name === "monitor") {
    return (
      <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 16 16">
        <rect x="2" y="2.5" width="12" height="8" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 13.5h5M8 10.5v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 .75v1.75M8 13.5v1.75M.75 8h1.75M13.5 8h1.75M2.7 2.7l1.06 1.06M12.24 12.24l1.06 1.06M2.7 13.3l1.06-1.06M12.24 3.76l1.06-1.06"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** Lovable-parity segmented appearance control (icon-only, accessible labels). */
export function DsAppearanceToggle({ className }: { className?: string }) {
  // The preference lives outside React (localStorage, the OS setting, and the
  // other appearance control). `useSyncExternalStore` is the supported way to
  // read it: React renders `getServerSnapshot` on the server *and* for the
  // hydration pass, so the two agree, then re-renders with the real value.
  const mode = useSyncExternalStore<Mode>(
    subscribeToThemeChanges,
    readThemePreference,
    serverThemePreference
  );

  // Assert the resolved theme on <html> after hydration. The pre-paint
  // bootstrap already did this, but if React ever re-acquires the <html>
  // singleton it rebuilds the attribute set from props and drops `data-theme`,
  // so converging once per preference change keeps the document honest.
  useEffect(() => {
    syncThemeFromPreference();
  }, [mode]);

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn("ds-appearance", className)}
    >
      {options.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          aria-label={label}
          title={label}
          className={cn("ds-appearance__btn", mode === value && "ds-appearance__btn--active")}
          onClick={() => applyThemePreference(value)}
        >
          <Icon name={icon} />
        </button>
      ))}
    </div>
  );
}
