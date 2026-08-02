import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

/**
 * Hard regression guard: `/` must render the Lovable homepage tree,
 * never the legacy marketing-v2 HeroAuthorizationDemo composition.
 */
describe("lovable homepage regression", () => {
  const rootPage = source("app/page.tsx");
  const localePage = source("app/[locale]/page.tsx");
  const homeShell = source("components/marketing/MarketingHomePage.tsx");
  const home = source("components/marketing/LovableHomeContent.tsx");
  const header = source("components/design-system/MarketingHeader.tsx");
  const layout = source("components/design-system/MarketingLayout.tsx");

  it("wires / and locale / through the marketing (not marketing-v2) shell", () => {
    expect(rootPage).toContain('from "@/components/marketing/MarketingHomePage"');
    expect(localePage).toContain('from "@/components/marketing/MarketingHomePage"');
    expect(rootPage).not.toContain("marketing-v2/MarketingHomePage");
    expect(homeShell).toContain("LovableHomeContent");
    expect(homeShell).toContain("MarketingLayout");
    expect(homeShell).not.toContain("HeroAuthorizationDemo");
    expect(homeShell).not.toContain("TrustStrip");
    expect(homeShell).not.toContain("ProblemSection");
    expect(homeShell).not.toContain("ProductShowcase");
    expect(homeShell).not.toContain("EnterpriseGovernance");
    expect(homeShell).not.toContain("FinalCTA");
    expect(homeShell).not.toContain("MarketingNavbar");
  });

  it("renders Lovable first-viewport copy and CTAs", () => {
    expect(home).toContain("Authority for AI agents");
    expect(home).toContain("Give AI agents freedom.");
    expect(home).toContain("Keep their authority controlled.");
    expect(home).toContain("Start building");
    expect(home).toContain("See how it works");
    expect(home).toContain("AuthorityFlowCanvas");
    expect(home).toContain('href="#authority"');
  });

  it("keeps Lovable section hierarchy after the hero", () => {
    const markers = [
      "Built for teams running agents in real workflows",
      "One path, from request to action.",
      "Human decisions become better defaults.",
      "Every approval becomes evidence.",
      "Autonomy should not mean",
      "Every agent should answer for itself.",
      "Authority should be explicit.",
      "Routine work flows. Risk waits.",
      "See every action. Understand every decision.",
      "One decision before the action.",
      "Default to no. Allow with intent."
    ];
    let cursor = 0;
    for (const marker of markers) {
      const index = home.indexOf(marker, cursor);
      expect(index, `missing or out-of-order: ${marker}`).toBeGreaterThan(cursor - 1);
      cursor = index + marker.length;
    }
  });

  it("rejects legacy hero copy and controls on the live homepage tree", () => {
    const live = `${homeShell}\n${home}\n${header}\n${layout}`;
    for (const banned of [
      "Control what your AI Agents are allowed to do.",
      "Control what your AI agents are allowed to do.",
      "Start securing agents",
      "Continue with Google",
      "Read the technical overview",
      "Verify-before-execute",
      "Human approval gates",
      "Google SSO for teams",
      "Auditable decision records",
      "HeroAuthorizationDemo",
      "HERO_SCENARIOS"
    ]) {
      expect(live).not.toContain(banned);
    }
  });

  it("keeps Lovable navigation labels (no Enterprise)", () => {
    for (const label of [
      "Product",
      "Adaptive engine",
      "Developers",
      "Pricing",
      "Security",
      "Status",
      "Blog"
    ]) {
      expect(header).toContain(`label: "${label}"`);
    }
    expect(header).not.toContain('label: "Enterprise"');
    expect(header).toContain("Start building");
    expect(header).not.toContain("Start securing agents");
  });

  it("renders authority-flow and adaptive engine surfaces", () => {
    expect(home).toContain("AuthorityFlowCanvas");
    expect(home).toContain("AuthorityMap");
    expect(home).toContain("LearningTimeline");
    expect(home).toContain("AdaptiveModes");
    expect(home).toContain("AdaptiveSafetyNote");
    expect(home).toContain("PatternCards");
    expect(home).toContain("IdentityCanvas");
    expect(home).toContain("PermissionBoundaries");
    expect(home).toContain("ApprovalSequence");
    expect(home).toContain("DashboardShowcase");
  });
});
