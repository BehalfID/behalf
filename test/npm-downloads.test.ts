import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDownloads, getSdkDownloads } from "@/lib/npmDownloads";

/**
 * The homepage shows this figure as the one number a visitor can independently
 * verify, so a bad parse must render nothing rather than something wrong.
 */
describe("getSdkDownloads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: unknown, ok = true) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok,
      json: async () => response
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns the trailing-30-day count and window end", async () => {
    stubFetch({ downloads: 1284, start: "2026-07-12", end: "2026-08-10", package: "@behalfid/sdk" });
    await expect(getSdkDownloads()).resolves.toEqual({ count: 1284, end: "2026-08-10" });
  });

  it("requests the last-month point endpoint for the published package", async () => {
    const fetchMock = stubFetch({ downloads: 5, end: "2026-08-10" });
    await getSdkDownloads();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.npmjs.org/downloads/point/last-month/@behalfid/sdk",
      expect.objectContaining({ next: { revalidate: 86_400 } })
    );
  });

  it("returns null on a non-ok response", async () => {
    stubFetch({ error: "package not found" }, false);
    await expect(getSdkDownloads()).resolves.toBeNull();
  });

  it("returns null when the payload has no usable count", async () => {
    for (const payload of [{}, { downloads: "1284" }, { downloads: Number.NaN }, { downloads: -1 }, null]) {
      stubFetch(payload);
      await expect(getSdkDownloads()).resolves.toBeNull();
    }
  });

  it("returns null when the network fails rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ENOTFOUND")));
    await expect(getSdkDownloads()).resolves.toBeNull();
  });

  it("tolerates a missing end date", async () => {
    stubFetch({ downloads: 42 });
    await expect(getSdkDownloads()).resolves.toEqual({ count: 42, end: "" });
  });
});

describe("formatDownloads", () => {
  it("groups digits without rounding", () => {
    expect(formatDownloads(0)).toBe("0");
    expect(formatDownloads(999)).toBe("999");
    expect(formatDownloads(1284)).toBe("1,284");
    expect(formatDownloads(1234567)).toBe("1,234,567");
  });
});
