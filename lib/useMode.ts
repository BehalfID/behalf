"use client";

import { useState, useEffect } from "react";

export type Mode = "simple" | "advanced";

const STORAGE_KEY = "mode";
const DEFAULT_MODE: Mode = "advanced";
const EVENT_NAME = "behalf:mode";

/** Read/write the Simple/Advanced mode.
 *  Mirrors the ThemeToggle pattern: stores in localStorage, applies
 *  `data-mode` on <html>, dispatches a custom event so all mounted
 *  useMode() instances in the same tab stay in sync.
 */
export function useMode() {
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Mode | null;
    const initial: Mode =
      stored === "simple" || stored === "advanced" ? stored : DEFAULT_MODE;

    document.documentElement.setAttribute("data-mode", initial);
    setMode(initial);
    setMounted(true);

    // Storage event: sync across tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "simple" || e.newValue === "advanced")) {
        setMode(e.newValue as Mode);
      }
    };

    // Custom event: sync within same tab (between multiple useMode callers)
    const handleCustom = (e: Event) => {
      const next = (e as CustomEvent<Mode>).detail;
      setMode(next);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(EVENT_NAME, handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(EVENT_NAME, handleCustom);
    };
  }, []);

  const toggle = () => {
    const next: Mode = mode === "advanced" ? "simple" : "advanced";
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute("data-mode", next);
    window.dispatchEvent(new CustomEvent<Mode>(EVENT_NAME, { detail: next }));
  };

  return { mode, toggle, mounted };
}
