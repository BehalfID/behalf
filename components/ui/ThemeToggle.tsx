"use client";

import { useEffect, useState } from "react";

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

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("theme") as "dark" | "light" | null;
    const resolved =
      stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(resolved);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  if (!mounted) return <span className="theme-toggle-placeholder" />;

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
