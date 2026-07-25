import { describe, expect, it, vi } from "vitest";
import {
  checkCliVersionUpdate,
  compareSemver,
} from "../packages/cli/src/lib/version";

describe("CLI version / update check", () => {
  it("compares semver-ish versions", () => {
    expect(compareSemver("0.2.12", "0.2.11")).toBeGreaterThan(0);
    expect(compareSemver("0.2.11", "0.2.11")).toBe(0);
    expect(compareSemver("0.2.10", "0.2.11")).toBeLessThan(0);
    expect(compareSemver("v1.0.0", "1.0.0")).toBe(0);
  });

  it("warns when npm latest is newer", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 })
    );
    const result = await checkCliVersionUpdate({
      currentVersion: "0.2.11",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("0.2.11");
    expect(result.detail).toContain("9.9.9");
    expect(result.fix).toMatch(/npm install -g @behalfid\/cli@latest/);
  });

  it("stays ok when up to date", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ version: "0.2.11" }), { status: 200 })
    );
    const result = await checkCliVersionUpdate({
      currentVersion: "0.2.11",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ status: "ok", detail: "0.2.11" });
  });

  it("does not fail doctor when the registry is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await checkCliVersionUpdate({
      currentVersion: "0.2.11",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 50,
    });
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("update check skipped");
  });
});
