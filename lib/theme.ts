export const THEME_STORAGE_KEY = "theme";
export const THEME_CHANGE_EVENT = "behalf-theme-change";

export type Theme = "dark" | "light";
export type ThemePreference = Theme | "system";

export function parseThemePreference(value: string | null): ThemePreference {
  return value === "dark" || value === "light" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === "dark" || preference === "light") return preference;
  return systemPrefersDark ? "dark" : "light";
}

/** Apply resolved theme to `data-theme` and Lovable `.dark` class. */
export function applyResolvedTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/* ---------------------------------------------------------------------------
 * One theme contract, shared by every appearance control.
 *
 * `ThemeToggle` and `DsAppearanceToggle` each used to carry their own copy of
 * the read/write/apply logic, and they had drifted: only one of them applied
 * the resolved theme on mount, and only one of them followed OS changes. The
 * helpers below are the single implementation both now call, so there is
 * exactly one writer of the preference and one writer of the DOM attributes.
 * ------------------------------------------------------------------------ */

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Server snapshot for `useSyncExternalStore`. The server cannot read
 * localStorage or the OS setting, so it reports `system`; React uses this same
 * value for the hydration render, which is what keeps the server markup and the
 * client's first render identical. The real preference is picked up in the
 * render immediately after hydration.
 */
export function serverThemePreference(): ThemePreference {
  return "system";
}

/** Stored preference, or `system` when unset/unreadable. */
export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Storage can be unavailable in hardened browser contexts.
    return "system";
  }
}

function writeThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

/**
 * Re-apply whatever the stored preference currently resolves to.
 *
 * Called on mount by both toggles. The pre-paint bootstrap in the root layout
 * already applies the theme, but `<html>` is a React 19 Host Singleton: if
 * React ever re-acquires it (any hydration mismatch, including ones caused by
 * browser extensions) it rebuilds the attribute set from props and drops
 * `data-theme`/`dark`. Asserting once when the control mounts makes the
 * rendered theme converge on the stored preference instead of silently
 * reverting to the light register. It is a single mount-time assertion — not a
 * timer, poll or repeated re-application.
 */
export function syncThemeFromPreference(): { preference: ThemePreference; theme: Theme } {
  const preference = readThemePreference();
  const theme = resolveTheme(preference, systemPrefersDark());
  applyResolvedTheme(theme);
  return { preference, theme };
}

/** Persist a preference, apply it, and notify every other control. */
export function applyThemePreference(preference: ThemePreference): Theme {
  writeThemePreference(preference);
  const theme = resolveTheme(preference, systemPrefersDark());
  applyResolvedTheme(theme);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  return theme;
}

/**
 * Subscribe to every source that can change the resolved theme: another
 * control in this tab, another tab, and the OS setting (which only matters
 * while the preference is `system`). Returns an unsubscribe function.
 */
export function subscribeToThemeChanges(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const handleSystemChange = () => {
    if (readThemePreference() === "system") onChange();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) onChange();
  };

  media.addEventListener("change", handleSystemChange);
  window.addEventListener("storage", handleStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);

  return () => {
    media.removeEventListener("change", handleSystemChange);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}
