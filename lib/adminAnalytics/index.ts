/**
 * Centralized admin (console) analytics service.
 *
 * Dispatches to Postgres SQL aggregations or Mongo pipelines based on the
 * repository backend. Every number on the console analytics dashboard comes
 * from here so cards, graphs, and tables cannot disagree.
 */

import { resolveRepositoryBackendFor } from "@/lib/repositories/backend";
import * as mongoAnalytics from "@/lib/repositories/mongo/adminAnalytics";
import * as postgresAnalytics from "@/lib/adminAnalytics/postgres";
import type { BucketGranularity, VerificationOutcomeTotals, VerificationSeriesPoint } from "@/lib/adminAnalytics/types";

export {
  MAX_CUSTOM_RANGE_DAYS,
  MAX_SERIES_BUCKETS,
  isAdminAnalyticsInterval,
  resolveAnalyticsRange,
  truncateUtc,
  utcDayWindow
} from "@/lib/adminAnalytics/range";
export { ADMIN_ANALYTICS_DEFINITIONS, ACTIVE_AGENT_DEFINITION } from "@/lib/adminAnalytics/definitions";
export * from "@/lib/adminAnalytics/types";

export type AdminAnalyticsQuery = postgresAnalytics.AdminAnalyticsQuery;
export type AdminAnalyticsResult = postgresAnalytics.AdminAnalyticsResult;

export const TOP_N = 10;

function usePostgresVerificationLogs() {
  return resolveRepositoryBackendFor("verificationLogs") === "postgres";
}

export async function getAdminAnalytics(
  query: AdminAnalyticsQuery = {}
): Promise<AdminAnalyticsResult> {
  if (usePostgresVerificationLogs()) {
    return postgresAnalytics.getAdminAnalytics(query);
  }
  return mongoAnalytics.getAdminAnalytics(query);
}

export async function getVerificationOutcomeTotals(options: {
  start: Date;
  end: Date;
  accountId?: string | null;
}): Promise<VerificationOutcomeTotals | null> {
  if (usePostgresVerificationLogs()) {
    return postgresAnalytics.getVerificationOutcomeTotals(options);
  }
  return mongoAnalytics.getVerificationOutcomeTotals(options);
}

export async function getVerificationSeries(options: {
  start: Date;
  end: Date;
  granularity: BucketGranularity;
  accountId?: string | null;
}): Promise<VerificationSeriesPoint[]> {
  if (usePostgresVerificationLogs()) {
    return postgresAnalytics.getVerificationSeries(options);
  }
  return mongoAnalytics.getVerificationSeries(options);
}
