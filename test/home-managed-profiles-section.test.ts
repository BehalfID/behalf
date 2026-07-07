import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage managed profiles section", () => {
  const homeSource = readFileSync(join(process.cwd(), "app/page.tsx"), "utf-8");
  const localeHomeSource = readFileSync(join(process.cwd(), "app/[locale]/page.tsx"), "utf-8");

  for (const [name, source] of [
    ["app/page.tsx", homeSource],
    ["app/[locale]/page.tsx", localeHomeSource],
  ] as const) {
    it(`${name} mentions Managed Profiles`, () => {
      expect(source).toContain("Managed Profiles for coding agents");
      expect(source).toContain("Control coding agents before they touch protected repos.");
    });

    it(`${name} links to CLI docs and demo script`, () => {
      expect(source).toContain('href="/docs/cli"');
      expect(source).toContain('href="/docs/demo-script"');
    });

    it(`${name} does not expose raw git remotes or local paths`, () => {
      expect(source).not.toMatch(/github\.com[:/]/i);
      expect(source).not.toMatch(/\/Users\//);
      expect(source).not.toMatch(/\/home\//);
      expect(source).not.toMatch(/git@/);
    });
  }
});
