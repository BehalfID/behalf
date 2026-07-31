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

export {
  MAX_CUSTOM_RANGE_DAYS,
  MAX_SERIES_BUCKETS,
  isAdminAnalyticsInterval,
  resolveAnalyticsRange,
  truncateUtc
} from "@/lib/adminAnalytics/range";
export { ADMIN_ANALYTICS_DEFINITIONS, ACTIVE_AGENT_DEFINITION } from "@/lib/adminAnalytics/definitions";
export * from "@/lib/adminAnalytics/types";

export type AdminAnalyticsQuery = postgresAnalytics.AdminAnalyticsQuery;
export type AdminAnalyticsResult = postgresAnalytics.AdminAnalyticsResult;

export const TOP_N = 10;

export async function getAdminAnalytics(
  query: AdminAnalyticsQuery = {}
): Promise<AdminAnalyticsResult> {
  if (resolveRepositoryBackendFor("verificationLogs") === "postgres") {
    return postgresAnalytics.getAdminAnalytics(query);
  }
  return mongoAnalytics.getAdminAnalytics(query);
}
