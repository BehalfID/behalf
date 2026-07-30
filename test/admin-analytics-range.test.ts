import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_RANGE_DAYS,
  MAX_SERIES_BUCKETS,
  bucketKeyForDate,
  enumerateBuckets,
  fillBuckets,
  isAdminAnalyticsInterval,
  resolveAnalyticsRange,
  truncateUtc
} from "@/lib/adminAnalytics/range";

const FIXED_NOW = new Date("2026-07-30T15:42:00.000Z");

describe("admin analytics range helpers", () => {
  it("recognises supported intervals", () => {
    expect(isAdminAnalyticsInterval("7d")).toBe(true);
    expect(isAdminAnalyticsInterval("custom")).toBe(true);
    expect(isAdminAnalyticsInterval("weekly")).toBe(false);
  });

  it("truncates to UTC hour and day boundaries", () => {
    expect(truncateUtc(new Date("2026-07-30T15:42:00.000Z"), "hour").toISOString()).toBe(
      "2026-07-30T15:00:00.000Z"
    );
    expect(truncateUtc(new Date("2026-07-30T15:42:00.000Z"), "day").toISOString()).toBe(
      "2026-07-30T00:00:00.000Z"
    );
  });

  it("builds bucket keys that match Mongo dateToString output", () => {
    const date = new Date("2026-07-30T15:42:00.000Z");
    expect(bucketKeyForDate(date, "hour")).toBe("2026-07-30T15");
    expect(bucketKeyForDate(date, "day")).toBe("2026-07-30");
  });

  it("resolves 24h with hourly buckets ending after the current hour", () => {
    const result = resolveAnalyticsRange({ interval: "24h", now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.range.interval).toBe("24h");
    expect(result.range.granularity).toBe("hour");
    expect(result.range.timezone).toBe("UTC");
    expect(result.range.end).toBe("2026-07-30T16:00:00.000Z");
    expect(result.range.start).toBe("2026-07-29T16:00:00.000Z");
    expect(result.range.bucketCount).toBe(24);
  });

  it("resolves 7d with daily buckets ending after the current UTC day", () => {
    const result = resolveAnalyticsRange({ interval: "7d", now: FIXED_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.range.granularity).toBe("day");
    expect(result.range.end).toBe("2026-07-31T00:00:00.000Z");
    expect(result.range.start).toBe("2026-07-24T00:00:00.000Z");
    expect(result.range.bucketCount).toBe(7);
    expect(result.range.seriesTruncated).toBe(false);
  });

  it("anchors all-time ranges to the oldest event", () => {
    const result = resolveAnalyticsRange({
      interval: "all",
      now: FIXED_NOW,
      earliestEventAt: new Date("2026-01-15T08:00:00.000Z")
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.range.start).toBe("2026-01-15T00:00:00.000Z");
    expect(result.range.end).toBe("2026-07-31T00:00:00.000Z");
  });

  it("parses custom ranges and treats date-only to as inclusive end-of-day UTC", () => {
    const result = resolveAnalyticsRange({
      interval: "custom",
      from: "2026-07-28",
      to: "2026-07-30",
      now: FIXED_NOW
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.range.start).toBe("2026-07-28T00:00:00.000Z");
    expect(result.range.end).toBe("2026-07-31T00:00:00.000Z");
    expect(result.range.granularity).toBe("day");
  });

  it("uses hourly buckets for short custom ranges", () => {
    const result = resolveAnalyticsRange({
      interval: "custom",
      from: "2026-07-30T10:00:00.000Z",
      to: "2026-07-30T20:00:00.000Z",
      now: FIXED_NOW
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.range.granularity).toBe("hour");
    expect(result.range.bucketCount).toBe(10);
  });

  it("rejects invalid, inverted and oversized custom ranges", () => {
    expect(resolveAnalyticsRange({ interval: "nope" }).ok).toBe(false);
    expect(resolveAnalyticsRange({ interval: "custom" }).ok).toBe(false);
    expect(
      resolveAnalyticsRange({
        interval: "custom",
        from: "2026-07-30",
        to: "2026-07-29"
      }).ok
    ).toBe(false);

    const tooLarge = resolveAnalyticsRange({
      interval: "custom",
      from: "2024-01-01",
      to: "2026-07-30"
    });
    expect(tooLarge.ok).toBe(false);
    if (tooLarge.ok) return;
    expect(tooLarge.code).toBe("range_too_large");
    expect(tooLarge.message).toContain(String(MAX_CUSTOM_RANGE_DAYS));
  });

  it("clamps series windows to the bucket cap", () => {
    const result = resolveAnalyticsRange({
      interval: "all",
      now: FIXED_NOW,
      earliestEventAt: new Date("2020-01-01T00:00:00.000Z")
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.range.seriesTruncated).toBe(true);
    expect(result.range.bucketCount).toBe(MAX_SERIES_BUCKETS);
    expect(new Date(result.range.seriesStart).getTime()).toBeGreaterThan(
      new Date("2020-01-01T00:00:00.000Z").getTime()
    );
  });

  it("enumerates gap-free UTC buckets", () => {
    const buckets = enumerateBuckets(
      new Date("2026-07-30T00:00:00.000Z"),
      new Date("2026-07-30T03:00:00.000Z"),
      "hour"
    );
    expect(buckets.map((bucket) => bucket.toISOString())).toEqual([
      "2026-07-30T00:00:00.000Z",
      "2026-07-30T01:00:00.000Z",
      "2026-07-30T02:00:00.000Z"
    ]);
  });

  it("zero-fills sparse aggregation rows", () => {
    const filled = fillBuckets(
      [{ _id: "2026-07-30", count: 4 }],
      {
        seriesStart: new Date("2026-07-29T00:00:00.000Z"),
        seriesEnd: new Date("2026-07-31T00:00:00.000Z"),
        granularity: "day",
        keyOf: (row) => row._id,
        build: (_bucketStart, row) => ({ count: row?.count ?? 0 })
      }
    );

    expect(filled).toEqual([{ count: 0 }, { count: 4 }]);
  });
});
