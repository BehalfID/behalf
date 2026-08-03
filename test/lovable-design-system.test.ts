import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cn } from "@/lib/cn";
import { applyResolvedTheme, resolveTheme } from "@/lib/theme";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

describe("lovable design-system port", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the Lovable CSS layer after the existing foundation stylesheet", () => {
    const layoutSource = source("app/layout.tsx");
    const foundationIndex = layoutSource.indexOf('import "./design-system-foundation.css"');
    const lovableIndex = layoutSource.indexOf('import "./lovable-design-system.css"');

    expect(foundationIndex).toBeGreaterThanOrEqual(0);
    expect(lovableIndex).toBeGreaterThan(foundationIndex);
  });

  it("registers Instrument Sans and syncs the .dark class in the theme boot script", () => {
    const layoutSource = source("app/layout.tsx");
    const globalsCss = source("app/globals.css");
    expect(layoutSource).toContain("Instrument_Sans");
    expect(layoutSource).toContain("--font-instrument-sans");
    expect(layoutSource).toContain("classList.toggle('dark'");
    expect(globalsCss).toContain("--font-sans: var(--font-instrument-sans), var(--font-inter)");
  });

  it("scopes Lovable tokens under .ds and does not redefine production :root tokens", () => {
    const css = source("app/lovable-design-system.css");

    // Opt-in root must exist.
    expect(css).toMatch(/\.ds\s*\{/);

    // Production collision tokens must not be assigned on bare :root.
    expect(css).not.toMatch(/:root\s*\{[^}]*--muted\s*:/s);
    expect(css).not.toMatch(/:root\s*\{[^}]*--border\s*:/s);
    expect(css).not.toMatch(/:root\s*\{[^}]*--surface-2\s*:/s);
    expect(css).not.toMatch(/:root\s*\{[^}]*--background\s*:/s);
    expect(css).not.toMatch(/:root\s*\{[^}]*--radius-sm\s*:/s);
    expect(css).not.toMatch(/:root\s*\{[^}]*--shadow-subtle\s*:/s);

    // Dark token overrides must stay under .ds, not rewrite html.dark globally.
    expect(css).not.toMatch(/(^|\n)\.dark\s*,\s*\nhtml\[data-theme="dark"\]\s*\{/);
    expect(css).toContain("html.dark .ds");
    expect(css).toContain("html[data-theme=\"dark\"] .ds");
  });

  it("ships copper tokens, section environments, and motion utilities under opt-in selectors", () => {
    const css = source("app/lovable-design-system.css");
    for (const token of [
      "--ds-primary:",
      ".ds .env-ivory",
      ".ds .env-copper-field",
      ".ds .slash-seam",
      ".ds .display-2xl",
      ".ds-reveal-hidden",
      ".ds-reveal-shown",
      ".ds .path-pulse",
      "prefers-reduced-motion"
    ]) {
      expect(css).toContain(token);
    }
  });

  it("wires header/footer shells into live public chrome with .ds opt-in", () => {
    const publicNavClient = source("components/layout/PublicNavClient.tsx");
    const publicFooter = source("components/layout/PublicFooter.tsx");
    const header = source("components/design-system/MarketingHeader.tsx");
    const footer = source("components/design-system/MarketingFooter.tsx");

    expect(publicNavClient).toContain("MarketingHeader");
    expect(publicFooter).toContain("MarketingFooter");
    expect(header).toContain('className={cn("ds ds-header');
    expect(footer).toContain('className={cn("ds ds-footer');
    expect(header).toContain("/adaptive-engine");
    expect(header).toContain("/pricing");
  });

  it("does not introduce forbidden Phase 1 dependencies or mock backends", () => {
    const pkg = source("package.json");
    // The scoped Tailwind pipeline (app/ds-tailwind.src.css + scripts/build-ds-css.mjs)
    // is an approved BUILD-TIME tool that emits `.ds`-scoped CSS for the Lovable
    // marketing components. It must never become a runtime/production dependency,
    // and no Tailwind runtime/preflight may ship to the browser.
    const pkgJson = JSON.parse(pkg) as {
      dependencies?: Record<string, string>;
    };
    expect(pkgJson.dependencies ?? {}).not.toHaveProperty("tailwindcss");
    expect(pkgJson.dependencies ?? {}).not.toHaveProperty("@tailwindcss/cli");
    expect(pkgJson.dependencies ?? {}).not.toHaveProperty("@tailwindcss/vite");
    expect(pkg).not.toMatch(/"@tanstack\/react-start"/);
    expect(pkg).not.toMatch(/"nitropack"/);
    expect(pkg).not.toMatch(/"@supabase\/supabase-js"/);

    const designSystemIndex = source("components/design-system/index.ts");
    expect(designSystemIndex).not.toMatch(/mock/i);
    expect(designSystemIndex).not.toMatch(/supabase/i);
  });

  it("joins class names and drops falsy parts", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("resolves system theme from media preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("mirrors data-theme onto the Lovable .dark class", () => {
    const classList = {
      dark: false,
      toggle(token: string, force?: boolean) {
        if (token === "dark") this.dark = Boolean(force);
      },
      contains(token: string) {
        return token === "dark" ? this.dark : false;
      }
    };
    const documentElement = {
      theme: "",
      classList,
      setAttribute(name: string, value: string) {
        if (name === "data-theme") this.theme = value;
      },
      getAttribute(name: string) {
        return name === "data-theme" ? this.theme : null;
      }
    };
    vi.stubGlobal("document", { documentElement });

    applyResolvedTheme("dark");
    expect(documentElement.getAttribute("data-theme")).toBe("dark");
    expect(documentElement.classList.contains("dark")).toBe(true);

    applyResolvedTheme("light");
    expect(documentElement.getAttribute("data-theme")).toBe("light");
    expect(documentElement.classList.contains("dark")).toBe(false);
  });
});
