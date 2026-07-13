import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("dashboard billing onboarding guard", () => {
  it("applies the same hard setup redirect as ProtectedDashboard", async () => {
    const source = await readFile(join(process.cwd(), "app/dashboard/billing/page.tsx"), "utf8");
    expect(source).toContain('import { shouldForceAccountSetup } from "@/lib/onboardingRedirect"');
    expect(source).toMatch(/if \(await shouldForceAccountSetup\(user\.userId\)\) redirect\("\/onboarding"\)/);
  });

  it("preserves login redirect before setup redirect", async () => {
    const source = await readFile(join(process.cwd(), "app/dashboard/billing/page.tsx"), "utf8");
    const loginRedirect = source.indexOf('if (!user) redirect("/login")');
    const setupRedirect = source.indexOf('redirect("/onboarding")');
    expect(loginRedirect).toBeGreaterThan(-1);
    expect(setupRedirect).toBeGreaterThan(loginRedirect);
  });
});
