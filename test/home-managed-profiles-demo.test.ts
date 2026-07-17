import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical homepage managed-profile mockup", () => {
  const source = readFileSync(
    join(process.cwd(), "components/marketing-v2/ManagedProfileDemo.tsx"),
    "utf-8"
  );

  it("shows required-mode controls for protected repositories", () => {
    expect(source).toContain("Managed coding-agent profile");
    expect(source).toContain("MODE · REQUIRED");
    expect(source).toContain("Protected repositories");
    expect(source).toContain("Denied commands");
  });

  it("does not expose raw git remotes or local paths", () => {
    expect(source).not.toMatch(/github\.com[:/]/i);
    expect(source).not.toMatch(/\/Users\//);
    expect(source).not.toMatch(/\/home\//);
    expect(source).not.toMatch(/git@/);
  });
});
