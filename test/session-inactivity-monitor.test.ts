import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("SessionInactivityMonitor client boundary", () => {
  it("does not import server auth utilities directly", () => {
    const source = readFileSync(
      join(process.cwd(), "components/auth/SessionInactivityMonitor.tsx"),
      "utf-8"
    );
    expect(source).not.toContain("@/lib/developerAuth");
    expect(source).toContain('fetch("/api/auth/session"');
  });
});
