import { NextResponse, type NextRequest } from "next/server";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import { getCurrentDeveloper } from "@/lib/developerAuth";
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
import { oauthInitFailureRedirect } from "@/lib/authProviders/oauthInitFailure";

export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const modeParam = request.nextUrl.searchParams.get("mode");
  const mode: GoogleOAuthMode =
    modeParam === "signup" ? "signup" : modeParam === "reauth" ? "reauth" : "login";

  if (!isGoogleOAuthConfigured()) {
    // Reached only by top-level navigation — send the user back to a page that
    // explains it rather than rendering raw JSON.
    return oauthInitFailureRedirect(request, "provider_unconfigured", mode);
  }

  const next = safeOAuthNextPath(request.nextUrl.searchParams.get("next"));

  let userId: string | null = null;
  if (mode === "reauth") {
    const user = await getCurrentDeveloper();
    if (!user) {
      return jsonError("Sign in before confirming your identity.", 401);
    }
    userId = user.userId;
    await recordIdentityAudit({
      userId,
      action: "account_deletion_reauth_started",
      provider: "google",
      providerAccountId: "google",
      request,
      context: "account_delete"
    });
  }

  // An unhandled throw here would return a zero-byte 500 with no Content-Type,
  // which a browser may offer as a file download instead of rendering.
  try {
    const started = buildGoogleAuthorizeRedirect({
      requestOrigin: request.nextUrl.origin,
      mode,
      next: mode === "reauth" ? next ?? "/dashboard/settings" : next,
      userId
    });
    if ("error" in started) {
      return oauthInitFailureRedirect(request, "provider_unconfigured", mode);
    }

    const response = NextResponse.redirect(started.url);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, started.stateCookieValue, oauthCookieOptions(600));
    return response;
  } catch (error) {
    console.error("[auth] Google authorization redirect failed", error);
    return oauthInitFailureRedirect(request, "redirect_failed", mode);
  }
}
