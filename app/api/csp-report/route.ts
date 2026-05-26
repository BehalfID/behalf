import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Browsers send CSP violation reports as JSON with content-type
// "application/csp-report" (older) or "application/reports+json" (Reporting API v1).
// We accept both, log the violation, and return 204.

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  // Cap body at 8 KB — reports are small; reject oversized payloads.
  const MAX_BYTES = 8 * 1024;
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    const report = JSON.parse(text) as Record<string, unknown>;

    // Normalise the two report shapes into a flat log entry.
    const violation =
      (report["csp-report"] as Record<string, unknown> | undefined) ?? report;

    logger.warn("csp_violation", {
      blockedUri: violation["blocked-uri"] ?? violation["blockedURL"],
      violatedDirective:
        violation["violated-directive"] ?? violation["effectiveDirective"],
      documentUri: violation["document-uri"] ?? violation["documentURL"],
      disposition: violation["disposition"],
      sourceFile: violation["source-file"] ?? violation["sourceFile"],
      lineNumber: violation["line-number"] ?? violation["lineNumber"],
    });
  } catch {
    // Malformed or empty report — log lightly and continue.
    logger.warn("csp_violation_parse_error", {});
  }

  return new NextResponse(null, { status: 204 });
}
