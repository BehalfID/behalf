import { NextResponse, type NextRequest } from "next/server";
import {
  buildGoogleAuthorizeRedirect,
  GOOGLE_OAUTH_STATE_COOKIE,
  isGoogleOAuthConfigured,
  oauthCookieOptions,
  safeOAuthNextPath,
  type GoogleOAuthMode
} from "@/lib/googleOAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";

export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  if (!isGoogleOAuthConfigured()) {
    return jsonError("Google sign-in is not configured.", 503);
  }

  const modeParam = request.nextUrl.searchParams.get("mode");
  const mode: GoogleOAuthMode = modeParam === "signup" ? "signup" : "login";
  const next = safeOAuthNextPath(request.nextUrl.searchParams.get("next"));

  const started = buildGoogleAuthorizeRedirect({
    requestOrigin: request.nextUrl.origin,
    mode,
    next
  });
  if ("error" in started) {
    return jsonError(started.error, 503);
  }

  const response = NextResponse.redirect(started.url);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, started.stateCookieValue, oauthCookieOptions(600));
  return response;
}
