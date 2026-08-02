import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

describe("canonical homepage product showcase", () => {
  const rootHomeSource = source("app/page.tsx");
  const localeHomeSource = source("app/[locale]/page.tsx");
  const marketingHomeSource = source("components/marketing/MarketingHomePage.tsx");
  const lovableHomeSource = source("components/marketing/LovableHomeContent.tsx");

  it("uses one shared homepage implementation for root and locale routes", () => {
    expect(rootHomeSource).toContain("MarketingHomePage");
    expect(localeHomeSource).toContain("MarketingHomePage");
    expect(marketingHomeSource).toContain("LovableHomeContent");
    expect(marketingHomeSource).toContain("MarketingLayout");
  });

  it("keeps Lovable product capability sections on the homepage", () => {
    for (const capability of ["Permissions", "Approvals", "Every decision recorded", "Identity"]) {
      expect(lovableHomeSource).toContain(capability);
    }
  });

  it("does not expose raw git remotes or local paths", () => {
    const combined = `${marketingHomeSource}\n${lovableHomeSource}`;
    expect(combined).not.toMatch(/github\.com[:/]/i);
    expect(combined).not.toMatch(/\/Users\//);
    expect(combined).not.toMatch(/\/home\//);
    expect(combined).not.toMatch(/git@/);
  });
});
