"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptic";
import {
  applyThemePreference,
  subscribeToThemeChanges,
  syncThemeFromPreference,
  type Theme,
  type ThemePreference
} from "@/lib/theme";

const PREFERENCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];

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

function preferenceLabel(preference: ThemePreference) {
  return PREFERENCE_OPTIONS.find((option) => option.value === preference)?.label ?? "System";
}

export function ThemeToggle({ allowSystem = false }: ThemeToggleProps) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    let active = true;

    function sync() {
      const { preference: nextPreference, theme: resolved } = syncThemeFromPreference();
      queueMicrotask(() => {
        if (!active) return;
        setPreference(nextPreference);
        setTheme(resolved);
        setMounted(true);
      });
    }

    sync();
    const unsubscribe = subscribeToThemeChanges(sync);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    function handleClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) close();
    }

    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, close]);

  function choose(nextPreference: ThemePreference) {
    haptic("light");
    const nextTheme = applyThemePreference(nextPreference);
    setPreference(nextPreference);
    setTheme(nextTheme);
    close();
  }

  if (!mounted) {
    return <span className={allowSystem ? "theme-switcher-placeholder" : "theme-toggle-placeholder"} />;
  }

  if (allowSystem) {
    return (
      <div className="theme-switcher" ref={containerRef}>
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Theme preference"
          className="theme-switcher__toggle"
          onClick={() => setOpen((value) => !value)}
          title={`Theme: ${preferenceLabel(preference)}`}
          type="button"
        >
          <span className="theme-switcher__icon">{theme === "dark" ? <MoonIcon /> : <SunIcon />}</span>
          <span className="theme-switcher__label">{preferenceLabel(preference)}</span>
        </button>

        {open ? (
          <div aria-label="Theme preference" className="theme-switcher__dropdown" role="listbox">
            {PREFERENCE_OPTIONS.map((option) => (
              <button
                aria-selected={option.value === preference}
                className={`theme-switcher__option${
                  option.value === preference ? " theme-switcher__option--active" : ""
                }`}
                key={option.value}
                onClick={() => choose(option.value)}
                role="option"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
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
