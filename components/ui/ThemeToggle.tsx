"use client";

import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptic";
import {
  parseThemePreference,
  resolveTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type Theme,
  type ThemePreference
} from "@/lib/theme";

function SunIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="8" x2="8" y1="0.75" y2="2.5" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="8" x2="8" y1="13.5" y2="15.25" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="0.75" x2="2.5" y1="8" y2="8" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="13.5" x2="15.25" y1="8" y2="8" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="2.697" x2="3.757" y1="2.697" y2="3.757" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="12.243" x2="13.303" y1="12.243" y2="13.303" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="2.697" x2="3.757" y1="13.303" y2="12.243" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="12.243" x2="13.303" y1="3.757" y2="2.697" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
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

type ThemeToggleProps = {
  allowSystem?: boolean;
};

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function applyPreference(preference: ThemePreference, systemPrefersDark: boolean) {
  try {
    if (preference === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }

  const resolved = resolveTheme(preference, systemPrefersDark);
  document.documentElement.setAttribute("data-theme", resolved);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  return resolved;
}

export function ThemeToggle({ allowSystem = false }: ThemeToggleProps) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let active = true;

    function sync() {
      const nextPreference = readPreference();
      const resolved = resolveTheme(nextPreference, media.matches);
      document.documentElement.setAttribute("data-theme", resolved);
      queueMicrotask(() => {
        if (!active) return;
        setPreference(nextPreference);
        setTheme(resolved);
        setMounted(true);
      });
    }

    function syncSystemPreference() {
      if (readPreference() === "system") sync();
    }

    function syncStoredPreference(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY || event.key === null) sync();
    }

    sync();
    media.addEventListener("change", syncSystemPreference);
    window.addEventListener("storage", syncStoredPreference);
    window.addEventListener(THEME_CHANGE_EVENT, sync);

    return () => {
      active = false;
      media.removeEventListener("change", syncSystemPreference);
      window.removeEventListener("storage", syncStoredPreference);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
    };
  }, []);

  function choose(nextPreference: ThemePreference) {
    haptic("light");
    const nextTheme = applyPreference(
      nextPreference,
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
    setPreference(nextPreference);
    setTheme(nextTheme);
  }

  if (!mounted) {
    return <span className={allowSystem ? "theme-select-placeholder" : "theme-toggle-placeholder"} />;
  }

  if (allowSystem) {
    return (
      <select
        aria-label="Theme preference"
        className="theme-select"
        onChange={(event) => choose(event.target.value as ThemePreference)}
        title={`Theme: ${preference}`}
        value={preference}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    );
  }

  function toggle() {
    choose(theme === "dark" ? "light" : "dark");
  }

  return (
    <button
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="theme-toggle"
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      type="button"
    >
      {theme === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
