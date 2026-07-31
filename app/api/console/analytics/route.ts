import { type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getAdminAnalytics } from "@/lib/adminAnalytics";
import { logger } from "@/lib/logger";
import { jsonError, noCacheJson } from "@/lib/responses";

/** Request-validation failures the client can fix, mapped to 400. */
const CLIENT_ERROR_CODES = new Set([
  "invalid_interval",
  "invalid_date",
  "inverted_range",
  "range_too_large",
  "missing_custom_range"
]);

const MAX_ACCOUNT_ID_LENGTH = 64;

/**
 * Platform-wide admin analytics for the console dashboard.
 *
 * Console session required. One request returns every card, graph and table on
 * the analytics page so they are all computed from the same window and the same
 * database read — separate fetches would let them drift apart.
 */
export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const params = request.nextUrl.searchParams;
  const accountId = params.get("accountId")?.trim() || null;
  if (accountId && (accountId.length > MAX_ACCOUNT_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(accountId))) {
    return jsonError("Invalid accountId filter.", 400, { code: "invalid_account_id" });
  }

  try {
    const result = await getAdminAnalytics({
      interval: params.get("interval"),
      from: params.get("from"),
      to: params.get("to"),
      accountId
    });

    if (!result.ok) {
      if (CLIENT_ERROR_CODES.has(result.code)) {
        return jsonError(result.message, 400, { code: result.code });
      }
      logger.error("admin_analytics_unresolved", { code: result.code });
      return jsonError(result.message, 500, { code: result.code });
    }

    return noCacheJson(result.payload);
  } catch (error) {
    logger.error("admin_analytics_request_failed", {
      interval: params.get("interval") ?? "7d",
      hasCustomRange: Boolean(params.get("from") || params.get("to")),
      scoped: Boolean(accountId),
      error: error instanceof Error ? error.message : String(error)
    });
    return jsonError("Analytics could not be computed.", 500, { code: "analytics_unavailable" });
  }
}
