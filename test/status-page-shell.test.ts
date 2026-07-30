import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("public status page shell", () => {
  it("uses direct health aggregation instead of self-HTTP", () => {
    expect(source("lib/statusHealth.ts")).toContain("No HTTP is issued");
    expect(source("app/status/page.tsx")).toContain("getSystemStatus");
    expect(source("app/[locale]/status/page.tsx")).toContain("getSystemStatus");
    expect(source("app/status/page.tsx")).not.toMatch(/fetch\s*\(/);
    expect(source("app/[locale]/status/page.tsx")).not.toMatch(/fetch\s*\(/);
  });

  it("keeps PublicNav from crashing public pages when session lookup fails", () => {
    expect(source("components/layout/PublicNav.tsx")).toContain("createPublicAuthAction(false)");
    expect(source("components/layout/PublicNav.tsx")).toMatch(/catch\s*\{/);
  });

  it("does not link the error page back into itself on /status", () => {
    const board = source("components/status/StatusBoard.tsx");
    expect(board).toContain("refreshHref");
    expect(board).toContain("Refresh status");
    expect(source("app/error.tsx")).toContain('href="/status"');
  });
});
