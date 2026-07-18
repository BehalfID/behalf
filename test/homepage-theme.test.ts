import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseThemePreference, resolveTheme } from "@/lib/theme";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

describe("system-aware homepage theme", () => {
  const layoutSource = source("app/layout.tsx");
  const homeSource = source("components/marketing-v2/MarketingHomePage.tsx");
  const navbarSource = source("components/marketing-v2/MarketingNavbarClient.tsx");
  const publicNavSource = source("components/layout/PublicNavClient.tsx");
  const homeCss = source("app/home-v2/home-v2.module.css");
  const globalCss = source("app/globals.css");

  it("uses only light and dark as explicit stored preferences", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("unexpected")).toBe("system");
  });

  it("resolves automatic mode from the operating system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("initializes before body content and listens for automatic changes", () => {
    expect(layoutSource.indexOf("dangerouslySetInnerHTML={{ __html: themeScript }}")).toBeLessThan(
      layoutSource.indexOf("<body>")
    );
    expect(layoutSource).toContain("m.addEventListener('change',c)");
    expect(layoutSource).toContain("v==='dark'||v==='light'?v:null");
    expect(layoutSource).toContain("e.key==='theme'||e.key===null");
  });

  it("allows the homepage to inherit the resolved root theme", () => {
    expect(homeSource).not.toContain("ui-theme-light");
    expect(homeCss).not.toContain("color-scheme: light");
    expect(homeCss).toContain("var(--surface-page)");
    expect(homeCss).toContain(':global(html[data-theme="dark"]) .root');
  });

  it("restores the shared public theme control on desktop and mobile", () => {
    expect(navbarSource.match(/<ThemeToggle allowSystem \/>/g)).toHaveLength(2);
    expect(publicNavSource.match(/<ThemeToggle allowSystem \/>/g)).toHaveLength(2);
    expect(navbarSource).toContain("drawerTheme");
  });

  it("keeps the cookie banner on the accessible brand foreground token", () => {
    expect(globalCss).toMatch(/\.site-consent__btn--accept\s*\{[^}]*color:\s*var\(--on-brand\)/s);
  });
});
