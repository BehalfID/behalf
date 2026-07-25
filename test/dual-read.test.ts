import { describe, expect, it, vi } from "vitest";
import {
  isDualReadEnabled,
  resultsEqual,
  withDualRead
} from "@/lib/repositories/dualRead";

describe("dual-read helper", () => {
  it("detects dual-read env latch", () => {
    expect(isDualReadEnabled({})).toBe(false);
    expect(isDualReadEnabled({ BEHALFID_REPO_DUAL_READ: "true" })).toBe(true);
  });

  it("compares dates by ISO string", () => {
    const a = { at: new Date("2026-01-01T00:00:00.000Z") };
    const b = { at: new Date("2026-01-01T00:00:00.000Z") };
    expect(resultsEqual(a, b)).toBe(true);
  });

  it("returns primary even when secondary differs", async () => {
    const log = vi.fn();
    const result = await withDualRead({
      enabled: true,
      aggregate: "accounts",
      method: "findAccountById",
      primary: async () => ({ accountId: "a1" }),
      secondary: async () => ({ accountId: "a2" }),
      log
    });
    expect(result).toEqual({ accountId: "a1" });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ equal: false, aggregate: "accounts" })
    );
  });

  it("does not fail closed when secondary throws", async () => {
    const log = vi.fn();
    const result = await withDualRead({
      enabled: true,
      aggregate: "accounts",
      method: "findAccountById",
      primary: async () => 42,
      secondary: async () => {
        throw new Error("secondary down");
      },
      log
    });
    expect(result).toBe(42);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ equal: false, error: "secondary down" })
    );
  });
});
