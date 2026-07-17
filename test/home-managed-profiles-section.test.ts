import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

describe("canonical homepage product showcase", () => {
  const rootHomeSource = source("app/page.tsx");
  const localeHomeSource = source("app/[locale]/page.tsx");
  const marketingHomeSource = source("components/marketing-v2/MarketingHomePage.tsx");
  const showcaseSource = source("components/marketing-v2/ProductShowcase.tsx");

  it("uses one shared homepage implementation for root and locale routes", () => {
    expect(rootHomeSource).toContain("MarketingHomePage");
    expect(localeHomeSource).toContain("MarketingHomePage");
    expect(marketingHomeSource).toContain("ProductShowcase");
  });

  it("keeps the approved consolidated product capabilities", () => {
    for (const capability of ["Permissions", "Approvals", "Decision logs", "Managed profiles"]) {
      expect(showcaseSource).toContain(capability);
    }
  });

  it("does not expose raw git remotes or local paths", () => {
    const combined = `${marketingHomeSource}\n${showcaseSource}`;
    expect(combined).not.toMatch(/github\.com[:/]/i);
    expect(combined).not.toMatch(/\/Users\//);
    expect(combined).not.toMatch(/\/home\//);
    expect(combined).not.toMatch(/git@/);
  });
});
