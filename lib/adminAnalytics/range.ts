/**
 * Pure date-range and bucketing helpers for admin analytics.
 *
 * Boundary convention (applies everywhere, no exceptions):
 *   - `start` is INCLUSIVE, `end` is EXCLUSIVE  →  `start <= createdAt < end`
 *   - every boundary is computed in UTC; the server's local timezone is never
 *     consulted, so results are identical regardless of where the process runs
 *   - buckets are aligned to UTC hour or UTC day boundaries
 *
 * The exclusive upper bound is what makes hourly and daily buckets tile the
 * range without overlap: a log at exactly midnight belongs to the new day only.
 */

import {
  ADMIN_ANALYTICS_INTERVALS,
  type AdminAnalyticsInterval,
  type AdminAnalyticsRange,
  type BucketGranularity
} from "@/lib/adminAnalytics/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Widest custom range the endpoint will accept before rejecting the request. */
export const MAX_CUSTOM_RANGE_DAYS = 400;
/** Hard ceiling on returned series points, so a wide range can never blow up. */
export const MAX_SERIES_BUCKETS = 400;
/** Custom ranges up to this span are bucketed hourly; wider ranges use days. */
export const HOURLY_MAX_SPAN_HOURS = 48;

const PRESET_DAYS: Record<"7d" | "30d" | "90d", number> = { "7d": 7, "30d": 30, "90d": 90 };
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type RangeErrorCode =
  | "invalid_interval"
  | "invalid_date"
  | "inverted_range"
  | "range_too_large"
  | "missing_custom_range";

export type ResolveRangeResult =
  | { ok: true; range: AdminAnalyticsRange }
  | { ok: false; code: RangeErrorCode; message: string };

export function isAdminAnalyticsInterval(value: unknown): value is AdminAnalyticsInterval {
  return typeof value === "string" && (ADMIN_ANALYTICS_INTERVALS as readonly string[]).includes(value);
}

/** Truncates a timestamp down to its UTC hour or UTC day boundary. */
export function truncateUtc(date: Date, granularity: BucketGranularity): Date {
  const step = granularity === "hour" ? HOUR_MS : DAY_MS;
  return new Date(Math.floor(date.getTime() / step) * step);
}

/** The current UTC calendar day as a half-open window `[start, end)`. */
export function utcDayWindow(now = new Date()): { start: Date; end: Date } {
  const start = truncateUtc(now, "day");
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function bucketStepMs(granularity: BucketGranularity): number {
  return granularity === "hour" ? HOUR_MS : DAY_MS;
}

/**
 * Mongo `$dateToString` key for a bucket. Must stay in lockstep with
 * `bucketKeyForDate` — the aggregation groups on the former and zero-fill
 * looks rows up by the latter.
 */
export function bucketKeyFormat(granularity: BucketGranularity): string {
  return granularity === "hour" ? "%Y-%m-%dT%H" : "%Y-%m-%d";
}

export function bucketKeyForDate(date: Date, granularity: BucketGranularity): string {
  const iso = date.toISOString();
  return granularity === "hour" ? iso.slice(0, 13) : iso.slice(0, 10);
}

/** Enumerates every bucket start in `[start, end)`, aligned and gap-free. */
export function enumerateBuckets(start: Date, end: Date, granularity: BucketGranularity): Date[] {
  const step = bucketStepMs(granularity);
  const first = truncateUtc(start, granularity).getTime();
  const limit = end.getTime();
  const buckets: Date[] = [];
  for (let cursor = first; cursor < limit; cursor += step) {
    buckets.push(new Date(cursor));
  }
  return buckets;
}

/**
 * Fills a sparse aggregation result into a dense, ordered series.
 * Buckets with no rows become explicit zeros rather than being omitted, so the
 * client never has to infer gaps (and charts cannot silently compress time).
 */
export function fillBuckets<Row, Point>(
  rows: Row[],
  options: {
    seriesStart: Date;
    seriesEnd: Date;
    granularity: BucketGranularity;
    keyOf: (row: Row) => string;
    build: (bucketStart: Date, row: Row | undefined) => Point;
  }
): Point[] {
  const byKey = new Map<string, Row>();
  for (const row of rows) {
    const key = options.keyOf(row);
    if (typeof key === "string") byKey.set(key, row);
  }
  return enumerateBuckets(options.seriesStart, options.seriesEnd, options.granularity).map((bucketStart) =>
    options.build(bucketStart, byKey.get(bucketKeyForDate(bucketStart, options.granularity)))
  );
}

function parseBoundary(value: string, inclusiveEnd: boolean): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Date-only input is anchored to UTC midnight rather than the server locale.
  const parsed = DATE_ONLY_RE.test(trimmed) ? new Date(`${trimmed}T00:00:00.000Z`) : new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  // A date-only `to=2026-05-18` means "through the end of the 18th", which with
  // an exclusive upper bound is midnight at the start of the 19th.
  if (inclusiveEnd && DATE_ONLY_RE.test(trimmed)) {
    return new Date(parsed.getTime() + DAY_MS);
  }
  return parsed;
}

function granularityForSpan(spanMs: number): BucketGranularity {
  return spanMs <= HOURLY_MAX_SPAN_HOURS * HOUR_MS ? "hour" : "day";
}

function buildRange(
  interval: AdminAnalyticsInterval,
  start: Date,
  end: Date,
  granularity: BucketGranularity
): AdminAnalyticsRange {
  const step = bucketStepMs(granularity);
  const alignedStart = truncateUtc(start, granularity);
  let seriesStart = alignedStart;
  let seriesTruncated = false;
  const totalBuckets = Math.ceil((end.getTime() - alignedStart.getTime()) / step);
  if (totalBuckets > MAX_SERIES_BUCKETS) {
    seriesStart = new Date(end.getTime() - MAX_SERIES_BUCKETS * step);
    seriesTruncated = true;
  }
  const bucketCount = Math.max(
    0,
    Math.ceil((end.getTime() - seriesStart.getTime()) / step)
  );

  return {
    interval,
    start: start.toISOString(),
    end: end.toISOString(),
    granularity,
    timezone: "UTC",
    seriesStart: seriesStart.toISOString(),
    seriesEnd: end.toISOString(),
    seriesTruncated,
    bucketCount
  };
}

/**
 * Resolves the requested interval into concrete UTC boundaries.
 *
 * Preset windows end at the boundary *after* the current bucket, so the
 * in-progress hour/day is included as the final (incomplete) bucket instead of
 * being dropped — the caller flags that as partial data.
 */
export function resolveAnalyticsRange(input: {
  interval?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
  /** Oldest verification timestamp; anchors the `all` interval. */
  earliestEventAt?: Date | null;
}): ResolveRangeResult {
  const rawInterval = input.interval?.trim() || "7d";
  if (!isAdminAnalyticsInterval(rawInterval)) {
    return {
      ok: false,
      code: "invalid_interval",
      message: `Unsupported interval "${rawInterval}". Supported: ${ADMIN_ANALYTICS_INTERVALS.join(", ")}.`
    };
  }

  const now = input.now ?? new Date();

  if (rawInterval === "24h") {
    const end = new Date(truncateUtc(now, "hour").getTime() + HOUR_MS);
    return { ok: true, range: buildRange("24h", new Date(end.getTime() - 24 * HOUR_MS), end, "hour") };
  }

  if (rawInterval === "7d" || rawInterval === "30d" || rawInterval === "90d") {
    const end = new Date(truncateUtc(now, "day").getTime() + DAY_MS);
    const start = new Date(end.getTime() - PRESET_DAYS[rawInterval] * DAY_MS);
    return { ok: true, range: buildRange(rawInterval, start, end, "day") };
  }

  if (rawInterval === "all") {
    const end = new Date(truncateUtc(now, "day").getTime() + DAY_MS);
    // With no persisted events, "all time" collapses to today rather than
    // inventing a window.
    const earliest = input.earliestEventAt ?? new Date(end.getTime() - DAY_MS);
    const start = truncateUtc(earliest < end ? earliest : new Date(end.getTime() - DAY_MS), "day");
    return { ok: true, range: buildRange("all", start, end, "day") };
  }

  if (!input.from || !input.to) {
    return {
      ok: false,
      code: "missing_custom_range",
      message: "Custom intervals require both `from` and `to`."
    };
  }

  const start = parseBoundary(input.from, false);
  const end = parseBoundary(input.to, true);
  if (!start || !end) {
    return {
      ok: false,
      code: "invalid_date",
      message: "`from` and `to` must be ISO-8601 timestamps or YYYY-MM-DD dates."
    };
  }
  if (end <= start) {
    return { ok: false, code: "inverted_range", message: "`to` must be after `from`." };
  }

  const spanMs = end.getTime() - start.getTime();
  if (spanMs > MAX_CUSTOM_RANGE_DAYS * DAY_MS) {
    return {
      ok: false,
      code: "range_too_large",
      message: `Custom ranges are limited to ${MAX_CUSTOM_RANGE_DAYS} days. Use interval=all for lifetime totals.`
    };
  }

  return { ok: true, range: buildRange("custom", start, end, granularityForSpan(spanMs)) };
}
