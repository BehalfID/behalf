"use client";

import { useEffect, useState } from "react";
import {
  applyResolvedTheme,
  parseThemePreference,
  resolveTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
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

function readPreference(): Mode {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function applyPreference(preference: Mode) {
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // ignore
  }
  const resolved = resolveTheme(preference, window.matchMedia("(prefers-color-scheme: dark)").matches);
  applyResolvedTheme(resolved);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Lovable-parity segmented appearance control (icon-only, accessible labels). */
export function DsAppearanceToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMode(readPreference());
    setMounted(true);
    function sync() {
      setMode(readPreference());
    }
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  if (!mounted) {
    return <span className={cn("ds-appearance", className)} aria-hidden />;
  }

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
          onClick={() => {
            applyPreference(value);
            setMode(value);
          }}
        >
          <Icon name={icon} />
        </button>
      ))}
    </div>
  );
}
