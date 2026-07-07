import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage managed profiles interactive demo", () => {
  const homeDemoSource = readFileSync(
    join(process.cwd(), "components/ui/HomeDemo.tsx"),
    "utf-8",
  );

  it("includes the Protected repo launch scenario", () => {
    expect(homeDemoSource).toContain("Protected repo launch");
    expect(homeDemoSource).toContain("claude");
    expect(homeDemoSource).toContain("0123456789abcdef");
    expect(homeDemoSource).toContain("required mode");
  });

  it("does not expose raw git remotes or local paths", () => {
    expect(homeDemoSource).not.toMatch(/github\.com[:/]/i);
    expect(homeDemoSource).not.toMatch(/\/Users\//);
    expect(homeDemoSource).not.toMatch(/\/home\//);
    expect(homeDemoSource).not.toMatch(/git@/);
  });
});
