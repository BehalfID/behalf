import { NextResponse, type NextRequest } from "next/server";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  oauthCookieOptions,
  safeOAuthNextPath
} from "@/lib/authProviders/oauthState";
import { getLoginProvider } from "@/lib/authProviders/providers/registry";
import { connectToDatabase } from "@/lib/db";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import type { OAuthFlowMode } from "@/models/OAuthAuthorizationState";

function readMode(raw: string | null): OAuthFlowMode {
  if (raw === "signup") return "signup";
  if (raw === "link") return "link";
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

  const configured = provider.isConfigured();
  if (!configured.configured) {
    // Deliberately generic: the reason names an env var and belongs in logs,
    // not in a response to an anonymous caller.
    return jsonError("GitHub sign-in is not configured.", 503);
  }

  const mode = readMode(request.nextUrl.searchParams.get("mode"));
  const next = safeOAuthNextPath(request.nextUrl.searchParams.get("next"));

  await connectToDatabase();

  // Linking must start from an authenticated session: the callback attaches the
  // resulting identity to whoever started the flow, so an anonymous "link" would
  // have no account to attach to.
  let userId: string | null = null;
  if (mode === "link") {
    const user = await getCurrentDeveloper();
    if (!user) {
      return jsonError("Sign in before connecting GitHub.", 401);
    }
    userId = user.userId;
  }

  const { state, codeChallenge } = await createOAuthState({
    provider: "github",
    mode,
    next,
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
}
