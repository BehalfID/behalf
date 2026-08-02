import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

describe("lovable marketing phase 2", () => {
  it("cuts public nav and footer over to design-system chrome", () => {
    expect(source("components/layout/PublicNavClient.tsx")).toContain("MarketingHeader");
    expect(source("components/layout/PublicFooter.tsx")).toContain("MarketingFooter");
  });

  it("replaces the homepage with Lovable marketing content under .ds", () => {
    const home = source("components/marketing-v2/MarketingHomePage.tsx");
    expect(home).toContain("MarketingLayout");
    expect(home).toContain("LovableHomeContent");
    expect(home).toContain("application/ld+json");
    expect(home).not.toContain("HeroAuthorizationDemo");
  });

  it("adds pricing, adaptive-engine, and contact routes with metadata", () => {
    for (const path of ["app/pricing/page.tsx", "app/adaptive-engine/page.tsx", "app/contact/page.tsx"]) {
      const page = source(path);
      expect(page).toContain("export const metadata");
      expect(page).toContain("canonical");
    }
  });

  it("keeps adaptive claims labelled and non-autonomous", () => {
    const adaptive = source("components/marketing/AdaptiveEnginePage.tsx");
    expect(adaptive).toContain("In development");
    expect(adaptive).toContain("Policy first");
    expect(adaptive).toContain("does not bypass administration");
    expect(source("components/marketing/LovableHomeContent.tsx")).toContain("BetaTag");
  });

  it("wires contact to the enterprise inquiry API", () => {
    const contact = source("components/marketing/ContactPage.tsx");
    expect(contact).toContain("/api/billing/enterprise-inquiry");
    expect(contact).not.toContain("nothing was transmitted");
  });

  it("derives pricing from production entitlements", () => {
    const pricing = source("components/marketing/PricingPage.tsx");
    expect(pricing).toContain("PLAN_ENTITLEMENTS");
    expect(pricing).toContain("PRO_PLAN_PRICE_CENTS");
    expect(pricing).not.toContain("$99");
  });

  it("lists new marketing routes in the sitemap", () => {
    const sitemap = source("app/sitemap.ts");
    expect(sitemap).toContain('path: "/pricing"');
    expect(sitemap).toContain('path: "/adaptive-engine"');
    expect(sitemap).toContain('path: "/contact"');
  });

  it("loads marketing utilities after the design-system token layer", () => {
    const layout = source("app/layout.tsx");
    const tokens = layout.indexOf('import "./lovable-design-system.css"');
    const utilities = layout.indexOf('import "./lovable-utilities.css"');
    expect(tokens).toBeGreaterThanOrEqual(0);
    expect(utilities).toBeGreaterThan(tokens);
  });
});
