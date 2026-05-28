"use client";

import { useMode } from "@/lib/useMode";
import { haptic } from "@/lib/haptic";

/**
 * Simple / Advanced mode toggle.
 * Mirrors the ThemeToggle pattern: updates localStorage + `data-mode` on <html>.
 * Renders null during SSR hydration to match the server snapshot.
 */
export function ModeToggle() {
  const { mode, toggle, mounted } = useMode();

  if (!mounted) return <span className="mode-toggle-placeholder" aria-hidden="true" />;

  const isSimple = mode === "simple";

  return (
    <div className="mode-toggle" role="group" aria-label="Display mode">
      <button
        type="button"
        className={["mode-toggle__btn", isSimple ? "mode-toggle__btn--active" : ""].filter(Boolean).join(" ")}
        aria-pressed={isSimple}
        title="Simple mode — plain English, no code"
        onClick={() => {
          if (!isSimple) { haptic("light"); toggle(); }
        }}
      >
        Simple
      </button>
      <button
        type="button"
        className={["mode-toggle__btn", !isSimple ? "mode-toggle__btn--active" : ""].filter(Boolean).join(" ")}
        aria-pressed={!isSimple}
        title="Advanced mode — full technical details"
        onClick={() => {
          if (isSimple) { haptic("light"); toggle(); }
        }}
      >
        Dev
      </button>
    </div>
  );
}
