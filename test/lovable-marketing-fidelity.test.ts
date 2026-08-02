import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

function cssRuleBody(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

describe("lovable marketing visual fidelity", () => {
  const utilities = source("app/lovable-utilities.css");
  const tokens = source("app/lovable-design-system.css");
  const home = source("components/marketing/LovableHomeContent.tsx");

  it("keeps Tailwind-scale container widths (regression for 22ch max-w-7xl bug)", () => {
    expect(cssRuleBody(utilities, ".ds .max-w-7xl")).toContain("max-width: 80rem");
    expect(cssRuleBody(utilities, ".ds .max-w-7xl")).not.toContain("22ch");
    expect(cssRuleBody(utilities, ".ds .max-w-6xl")).toContain("max-width: 72rem");
    expect(cssRuleBody(utilities, ".ds .max-w-3xl")).toContain("max-width: 48rem");
    expect(cssRuleBody(utilities, ".ds .max-w-xl")).toContain("max-width: 36rem");
    expect(cssRuleBody(utilities, ".ds .max-w-lg")).toContain("max-width: 32rem");
    expect(cssRuleBody(utilities, ".ds .max-w-md")).toContain("max-width: 28rem");
    expect(cssRuleBody(utilities, ".ds .max-w-sm")).toContain("max-width: 24rem");
    expect(cssRuleBody(utilities, ".ds .left-0")).toMatch(/left:\s*0/);
    expect(cssRuleBody(utilities, ".ds .left-0")).not.toContain("9px");
  });

  it("keeps display-2xl on a left-aligned unrestricted heading track", () => {
    const display = cssRuleBody(tokens, ".ds .display-2xl");
    expect(display).toContain("clamp(2.6rem, 8.2vw, 5.25rem)");
    expect(display).toContain("text-align: left");
    expect(display).toContain("max-width: none");
  });

  it("keeps hero CTA padding utilities and preflight margin resets", () => {
    expect(cssRuleBody(utilities, ".ds .px-6")).toContain("1.5rem");
    expect(cssRuleBody(utilities, ".ds .px-8")).toContain("2rem");
    expect(cssRuleBody(utilities, ".ds .h-10")).toContain("2.5rem");
    expect(tokens).toMatch(/\.ds h1,[\s\S]*\.ds p \{[\s\S]*margin:\s*0;/);
    expect(home).toContain("inline-flex h-10 items-center justify-center gap-2");
    expect(home).toContain("rounded-full bg-primary px-6 text-sm font-medium");
  });

  it("uses Lovable hero structure: max-w-7xl shell with max-w-3xl copy column", () => {
    expect(home).toContain('className="mx-auto max-w-7xl px-5 pt-20 sm:px-8 sm:pt-28 lg:pt-32"');
    expect(home).toContain('className="max-w-3xl"');
    expect(home).toContain('className="display-2xl mt-7"');
    expect(home).toContain("AuthorityFlowCanvas");
    expect(home).toContain('href="#authority"');
  });

  it("restores Lovable md header breakpoint for primary nav", () => {
    expect(tokens).toContain("/* Lovable: primary nav from md (768px). */");
    expect(tokens).toMatch(
      /@media \(min-width: 768px\) \{\s*\.ds-header__nav \{\s*display: flex;/
    );
    expect(tokens).toMatch(
      /@media \(min-width: 768px\) \{\s*\.ds-header__menu-btn \{\s*display: none;/
    );
    expect(cssRuleBody(tokens, ".ds-header__ghost")).toContain("white-space: nowrap");
    expect(cssRuleBody(tokens, ".ds-header__cta")).toContain("white-space: nowrap");
  });

  it("keeps desktop header density close to Lovable (Blog mobile-only, icon appearance)", () => {
    const header = source("components/design-system/MarketingHeader.tsx");
    expect(header).toContain('label: "Blog"');
    expect(header).toContain("desktop: false");
    expect(header).toContain("DsAppearanceToggle");
    expect(header).not.toContain("ThemeToggle allowSystem");
    expect(tokens).toContain(".ds-appearance");
    expect(tokens).toContain(".ds-header .lang-switcher__label");
  });

  it("keeps prefixed responsive utilities (sm:flex-row) instead of stripped media overrides", () => {
    expect(utilities).toContain(".ds .sm\\:flex-row");
    expect(utilities).toContain(".ds .sm\\:items-center");
    expect(utilities).toContain(".ds .sm\\:px-8");
    expect(utilities).toContain(".ds .lg\\:gap-16");
    expect(utilities).toContain("text-transform: uppercase");
    // Regression: unprefixed rules inside @media would incorrectly restyle all .flex/.uppercase
    expect(utilities).not.toMatch(
      /@media \(min-width: 640px\) \{[^}]*\.ds \.flex \{/
    );
  });
});
