import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("package-lock.json", () => {
  it("uses the repo root package name, not the cloud workspace artifact", () => {
    const lockPath = join(process.cwd(), "package-lock.json");
    const lockfile = JSON.parse(readFileSync(lockPath, "utf8")) as { name?: string };

    expect(lockfile.name).toBe("behalf");
    expect(lockfile.name).not.toBe("workspace");
  });
});
