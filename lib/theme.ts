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
