import { NextResponse, type NextRequest } from "next/server";
import { requireSetupTokenOrConsoleApi } from "@/lib/adminAuth";
import { purgeExpiredLogs } from "@/lib/logPurge";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) {
    return rateLimitError();
  }

  const authError = requireSetupTokenOrConsoleApi(request);
  if (authError) {
    return authError;
  }

  try {
    const summary = await purgeExpiredLogs();
    logger.info("log_purge_completed", {
      verificationLogsDeleted: summary.verificationLogsDeleted,
      siteAccessLogsDeleted: summary.siteAccessLogsDeleted,
      webhookDeliveriesDeleted: summary.webhookDeliveriesDeleted
    });
    return NextResponse.json({
      status: "ok",
      ...summary
    });
  } catch (error) {
    logger.error("log_purge_failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json(
      {
        status: "error",
        error: "Log purge failed."
      },
      { status: 500 }
    );
  }
}
