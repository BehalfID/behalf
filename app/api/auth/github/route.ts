import { NextResponse, type NextRequest } from "next/server";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  oauthCookieOptions,
  safeOAuthNextPath
} from "@/lib/authProviders/oauthState";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import { getLoginProvider } from "@/lib/authProviders/providers/registry";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import { oauthInitFailureRedirect } from "@/lib/authProviders/oauthInitFailure";
import type { OAuthFlowMode } from "@/lib/repositories/postgres/oauthAuthorizationStates";

function readMode(raw: string | null): OAuthFlowMode {
  if (raw === "signup") return "signup";
  if (raw === "link") return "link";
  if (raw === "reauth") return "reauth";
  return "login";
}

/**
 * Starts the GitHub authorization redirect.
 *
 * Kept as a server route rather than a direct link to github.com so the state
 * record is created and the binding cookie is set on the same navigation that
 * leaves for the provider.
 */
export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const provider = getLoginProvider("github");
  if (!provider) {
    return jsonError("GitHub sign-in is not available.", 503);
  }

  const mode = readMode(request.nextUrl.searchParams.get("mode"));

  const configured = provider.isConfigured();
  if (!configured.configured) {
    // Deliberately generic: the reason names an env var and belongs in logs,
    // not in a response to an anonymous caller. This route is only reached by a
    // top-level navigation, so send the user back to a page that explains it.
    return oauthInitFailureRedirect(request, "provider_unconfigured", mode);
  }

  const next = safeOAuthNextPath(request.nextUrl.searchParams.get("next"));

  // Linking and reauth must start from an authenticated session.
  let userId: string | null = null;
  if (mode === "link" || mode === "reauth") {
    const user = await getCurrentDeveloper();
    if (!user) {
      return jsonError(
        mode === "reauth"
          ? "Sign in before confirming your identity."
          : "Sign in before connecting GitHub.",
        401
      );
    }
    userId = user.userId;
    if (mode === "reauth") {
      await recordIdentityAudit({
        userId,
        action: "account_deletion_reauth_started",
        provider: "github",
        providerAccountId: "github",
        request,
        context: "account_delete"
      });
    }
  }

  // State creation touches the database and the authorize URL build can throw on
  // misconfiguration. Without this guard an unhandled throw returns a zero-byte
  // 500 with no Content-Type, which a browser may offer as a file download
  // instead of rendering — see lib/authProviders/oauthInitFailure.ts.
  try {
    const { state, codeChallenge } = await createOAuthState({
      provider: "github",
      mode,
      next: mode === "reauth" ? next ?? "/dashboard/settings" : next,
      userId
    });

    const url = provider.buildAuthorizeUrl({
      requestOrigin: request.nextUrl.origin,
      mode,
      codeChallenge,
      state
    });

    const response = NextResponse.redirect(url);
    response.cookies.set(
      OAUTH_STATE_COOKIE,
      state,
      oauthCookieOptions(Math.floor(OAUTH_STATE_TTL_MS / 1000))
    );
    return response;
  } catch (error) {
    console.error("[auth] GitHub authorization redirect failed", error);
    return oauthInitFailureRedirect(request, "redirect_failed", mode);
  }
}
