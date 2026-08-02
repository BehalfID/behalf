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
    expect(layoutSource).toContain("Instrument_Sans");
    expect(layoutSource).toContain("--font-instrument-sans");
    expect(layoutSource).toContain("classList.toggle('dark'");
  });

  it("ships copper tokens, section environments, and motion utilities", () => {
    const css = source("app/lovable-design-system.css");
    for (const token of [
      "--primary:",
      ".env-ivory",
      ".env-copper-field",
      ".slash-seam",
      ".display-2xl",
      ".reveal-hidden",
      ".reveal-shown",
      ".path-pulse",
      "prefers-reduced-motion"
    ]) {
      expect(css).toContain(token);
    }
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
