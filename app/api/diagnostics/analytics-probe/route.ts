import { type NextRequest } from "next/server";
import { requireSetupTokenOrConsoleApi } from "@/lib/adminAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { noCacheJson } from "@/lib/responses";
import { trackServerEvent } from "@/lib/analytics/server";
import { ANALYTICS_INGEST_ORIGIN } from "@/proxy";

/**
 * Analytics reachability probe.
 *
 * Answers one question that cannot be answered from a developer machine or CI:
 * can the deployed runtime actually reach the HeyCatch ingest host? Browser
 * capture and server delivery are separate SDK paths, so a browser showing no
 * events does not tell you whether the network path is the problem.
 *
 * Setup-token protected (same gate as /api/health/db) so it is not a public
 * endpoint, and it sends only a diagnostic event with a synthetic user id — no
 * customer data. Safe to delete once the install is confirmed.
 *
 *   curl -sS -X POST https://behalfid.com/api/diagnostics/analytics-probe \
 *     -H "Authorization: Bearer $BEHALFID_SETUP_TOKEN"
 */
export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const authError = requireSetupTokenOrConsoleApi(request);
  if (authError) return authError;

  // 1. Raw connectivity: the SDK swallows transport failures by design, so ask
  //    the network directly. This path is one the SDK itself fetches.
  const assetUrl = `${ANALYTICS_INGEST_ORIGIN}/static/tracing-headers.js`;
  const connectivity: Record<string, unknown> = { url: assetUrl };
  const startedAt = Date.now();
  try {
    const response = await fetch(assetUrl, {
      method: "GET",
      signal: AbortSignal.timeout(8_000)
    });
    connectivity.status = response.status;
    connectivity.ms = Date.now() - startedAt;
    // A non-200 here means something answered but not HeyCatch — typically an
    // egress proxy or firewall. Treat only 200 as "the runtime can reach it".
    connectivity.reachedHeyCatch = response.status === 200;
  } catch (error) {
    connectivity.reachedHeyCatch = false;
    connectivity.ms = Date.now() - startedAt;
    connectivity.error = error instanceof Error ? error.message : "unknown error";
  }

  // 2. Documented server path: send one diagnostic event and time it. The SDK
  //    never throws, so elapsed time plus the connectivity result above is the
  //    evidence, not the absence of an exception.
  const eventStartedAt = Date.now();
  await trackServerEvent(
    "heycatch_server_probe",
    { source: "analytics-probe-endpoint" },
    { userId: "diagnostic-server-probe" }
  );

  return noCacheJson({
    ok: true,
    ingestOrigin: ANALYTICS_INGEST_ORIGIN,
    connectivity,
    serverEvent: { name: "heycatch_server_probe", ms: Date.now() - eventStartedAt }
  });
}
