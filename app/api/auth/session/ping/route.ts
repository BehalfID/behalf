import { NextResponse, type NextRequest } from "next/server";
import {
  refreshDeveloperSessionActivity,
  requireDashboardMutationOrigin,
  setDeveloperSessionCookie
} from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const token = request.cookies.get("behalfid_developer")?.value;
  if (!token) {
    return jsonError("Developer authentication required.", 401);
  }

  const session = await refreshDeveloperSessionActivity(token);
  if (!session) {
    return jsonError("Session expired due to inactivity.", 401);
  }

  const response = NextResponse.json({ ok: true });
  setDeveloperSessionCookie(response, token);
  return response;
}
