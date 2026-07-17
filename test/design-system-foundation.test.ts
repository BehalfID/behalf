import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

const foundationCss = source("app/design-system-foundation.css");
const layoutSource = source("app/layout.tsx");
const previewSource = source("app/design-system/foundation/page.tsx");
const interactivePreviewSource = source("app/design-system/foundation/preview.tsx");
const homeSource = source("app/page.tsx");
const localeHomeSource = source("app/[locale]/page.tsx");
const marketingHomeSource = source("components/marketing-v2/MarketingHomePage.tsx");
const redirectSource = source("app/home-v2/page.tsx");
const homeCss = source("app/home-v2/home-v2.module.css");
const robotsSource = source("app/robots.ts");
const sitemapSource = source("app/sitemap.ts");
const buttonSource = source("components/ui/Button.tsx");
const inputSource = source("components/ui/Input.tsx");
const overlaySource = source("components/ui/Overlay.tsx");
const tabsSource = source("components/ui/Tabs.tsx");

describe("design-system foundation", () => {
  it("loads the semantic layer after the legacy global stylesheet", () => {
    const legacyIndex = layoutSource.indexOf('import "./globals.css"');
    const foundationIndex = layoutSource.indexOf('import "./design-system-foundation.css"');

    expect(legacyIndex).toBeGreaterThanOrEqual(0);
    expect(foundationIndex).toBeGreaterThan(legacyIndex);
  });

  it("defines the required semantic color, depth, layout, and typography roles", () => {
    for (const token of [
      "--surface-page",
      "--surface-elevated",
      "--surface-muted",
      "--surface-sidebar",
      "--surface-header",
      "--surface-selected",
      "--surface-inverse",
      "--surface-scrim",
      "--surface-dark",
      "--surface-inset",
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--text-link",
      "--text-accent",
      "--text-inverse",
      "--text-destructive",
      "--text-success",
      "--text-warning",
      "--border-subtle",
      "--border-standard",
      "--border-selected",
      "--border-focus",
      "--border-destructive",
      "--status-neutral-text",
      "--status-disabled-text",
      "--status-experimental-text",
      "--status-active-text",
      "--status-disconnected-text",
      "--accent-base: #d88a63",
      "--radius-small",
      "--radius-medium",
      "--radius-large",
      "--shadow-subtle",
      "--shadow-elevated",
      "--shadow-overlay",
      "--focus-ring",
      "--control-primary-bg",
      "--control-outline-bg",
      "--control-ghost-hover",
      "--control-destructive-bg",
      "--page-gutter-mobile",
      "--content-max-width",
      "--dashboard-content-max-width",
      "--form-max-width",
      "--type-display-size",
      "--type-page-title-size",
      "--type-section-title-size",
      "--type-card-title-size",
      "--type-body-size",
      "--type-compact-size",
      "--type-label-size",
      "--type-caption-size",
      "--type-mono-size"
    ]) {
      expect(foundationCss).toContain(token);
    }

    expect(foundationCss).toContain('html[data-theme="light"]');
    expect(foundationCss).toContain(".ui-theme-light");
    expect(foundationCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps application dark surfaces neutral and bridges legacy shell aliases", () => {
    expect(foundationCss).toContain("--surface-page: #0c0d0f");
    expect(foundationCss).toContain("--border-standard: #2b2e33");
    expect(foundationCss).toContain(".console-shell");
    expect(foundationCss).toContain(".docs-page");
    expect(foundationCss).not.toMatch(/#(?:0f0d0c|171310|211a16|382c26|4a3a32|3a2e28)\b/i);
  });

  it("keeps the shared button API compatible while adding complete state variants", () => {
    for (const variant of ["primary", "secondary", "outline", "ghost", "destructive", "danger"]) {
      expect(buttonSource).toContain(`| "${variant}"`);
      expect(foundationCss).toContain(`.ui-button--${variant}`);
    }

    expect(buttonSource).toContain('loading?: boolean');
    expect(buttonSource).toContain('aria-busy={loading || undefined}');
    expect(buttonSource).toContain('disabled={disabled || loading}');
    expect(foundationCss).toContain(".ui-button:focus-visible");
    expect(foundationCss).toContain(".ui-button:disabled");
  });

  it("uses native, associated form and overlay semantics", () => {
    expect(inputSource).toContain('aria-invalid={invalid || ariaInvalid || undefined}');
    expect(inputSource).toContain('role="alert"');
    expect(inputSource).toContain('type="checkbox"');
    expect(inputSource).toContain('type="radio"');
    expect(inputSource).toContain('role="switch"');
    expect(overlaySource).toContain("<dialog");
    expect(overlaySource).toContain("showModal()");
    expect(overlaySource).toContain('role="menu"');
    expect(overlaySource).toContain('role="tooltip"');
    expect(tabsSource).toContain('role="tablist"');
    expect(tabsSource).toContain('role="tabpanel"');
  });

  it("builds the isolated preview from real shared primitives and static examples", () => {
    const previewSources = `${previewSource}\n${interactivePreviewSource}`;

    for (const component of [
      "Button",
      "Input",
      "Card",
      "DecisionBadge",
      "Table",
      "Pagination",
      "Dialog",
      "EmptyState",
      "LoadingState",
      "Alert"
    ]) {
      expect(previewSources).toContain(component);
    }

    expect(previewSource).not.toMatch(/fetch\(|cookies\(|headers\(|prisma|mongoose/i);
    expect(previewSource).toContain('robots: { index: false, follow: false }');
    expect(previewSource).toContain('process.env.NODE_ENV === "production"');
    expect(previewSource).toContain("notFound()");
    expect(robotsSource).toContain('disallow: "/design-system/foundation"');
  });

  it("promotes the redesigned homepage without retaining a divergent preview", () => {
    expect(homeSource).toContain("MarketingHomePage");
    expect(localeHomeSource).toContain("MarketingHomePage");
    expect(marketingHomeSource).not.toContain("ui-theme-light");
    expect(marketingHomeSource).toContain('id="main-content"');
    expect(marketingHomeSource).not.toMatch(/preview|production is unchanged/i);
    expect(redirectSource).toContain('permanentRedirect("/")');
    expect(homeCss).not.toContain("--v2-");
    expect(homeCss).not.toContain("previewBanner");
    expect(homeCss).toContain("var(--surface-page)");
    expect(homeCss).toContain("var(--text-primary)");
    expect(homeCss).toContain("var(--page-gutter)");
    expect(homeCss).toContain("var(--section-spacing)");
    expect(sitemapSource).not.toContain('{ path: "/home-v2"');
  });
});
