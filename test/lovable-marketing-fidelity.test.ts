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
  const generatedUtilities = source("app/lovable-utilities.generated.css");
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
    // The clamp FLOOR is an INTENTIONAL deviation from Lovable's 2.6rem: below
    // ~420px the 8.2vw term never wins, so 2.6rem pinned a six-line headline on
    // a phone and pushed the hero's primary CTA under the fold. The vw term and
    // the 5.25rem ceiling are untouched, so every width Lovable was designed
    // against renders identically — assert both halves so a future edit cannot
    // quietly restyle the desktop heading while claiming to be a mobile fix.
    expect(display).toContain("clamp(2.15rem, 8.2vw, 5.25rem)");
    expect(display).toContain("text-align: left");
    expect(display).toContain("max-width: none");
  });

  it("keeps hero CTA padding utilities and preflight margin resets", () => {
    expect(cssRuleBody(utilities, ".ds .px-6")).toContain("1.5rem");
    expect(cssRuleBody(utilities, ".ds .px-8")).toContain("2rem");
    // h-11 is emitted by the Tailwind build (lovable-utilities.generated.css)
    // rather than the hand-maintained sheet. Assert it there so a CTA height
    // whose utility was never generated cannot ship looking correct in source.
    // Tailwind v4 emits the spacing scale as calc(var(--spacing) * n); with
    // --spacing: 0.25rem that is the 2.75rem / 44px touch target.
    expect(generatedUtilities).toContain("--spacing: 0.25rem");
    expect(cssRuleBody(generatedUtilities, ".ds .h-11")).toContain("calc(var(--spacing) * 11)");
    expect(tokens).toMatch(/\.ds h1,[\s\S]*\.ds p \{[\s\S]*margin:\s*0;/);
    // The hero CTA moved out of LovableHomeContent into a shared SignupCta so
    // every entry point keeps one shape and reports its own placement. The pill
    // itself is still Lovable's — rounded-full, bg-primary, px-6 — at h-11
    // rather than h-10 so the touch target clears 44px, and full-width until
    // `sm` so a phone gets a row instead of a pill in the left margin.
    const cta = source("components/marketing/SignupCta.tsx");
    expect(cta).toContain("h-11 w-full items-center justify-center gap-2");
    expect(cta).toContain("rounded-full");
    expect(cta).toContain("bg-primary text-primary-foreground hover:bg-primary/90");
    expect(cta).toContain("px-6 text-[15px] font-medium");
    expect(cta).toContain("sm:w-auto");
  });

  it("uses Lovable hero structure: max-w-7xl shell with max-w-3xl copy column", () => {
    // Hero shell keeps Lovable's max-w-7xl + horizontal rhythm. The top padding is an
    // INTENTIONAL deviation from Lovable (PR #164): the header->eyebrow gap is tightened
    // to ~94px at >=1280, ~70px at 1024 and ~46px on mobile, via content-driven padding
    // only (no viewport-height positioning). Assert the shell and the responsive
    // padding ladder rather than Lovable's original pt-20/28/32.
    expect(home).toContain('className="mx-auto max-w-7xl px-5 pt-10 sm:px-8 sm:pt-14 lg:pt-16 xl:pt-[5.5rem]"');
    expect(home).toContain('className="max-w-3xl"');
    // Lovable's mt-7 is kept from `sm` up; the base step is tightened so the
    // hero's CTA is reachable on a phone. Assert the responsive pair rather
    // than the bare utility, so a future edit cannot drop the desktop rhythm.
    expect(home).toContain('className="display-2xl mt-5 sm:mt-7"');
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
