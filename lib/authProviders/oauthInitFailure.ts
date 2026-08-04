import { NextResponse, type NextRequest } from "next/server";
import type { OAuthErrorCode } from "@/lib/authProviders/oauthErrors";
import { safeOAuthNextPath } from "@/lib/authProviders/oauthState";
import type { OAuthFlowMode } from "@/lib/repositories/postgres/oauthAuthorizationStates";

/**
 * Builds the visible failure response for a provider *initiation* route.
 *
 * These routes are only ever reached by a top-level navigation from an anchor
 * ("Continue with GitHub"). If one throws, Next.js emits a zero-byte 500 with
 * no `Content-Type`; a browser asked to navigate to an untyped, unrenderable
 * response can offer it as a file download instead of showing anything — which
 * is both alarming and undebuggable for the user.
 *
 * So every failure here becomes a redirect back to the page the user came
 * from, carrying a stable `oauth_error` code that the auth client already
 * renders via `oauthErrorMessage()`. A redirect can never be downloaded.
 *
 * `mode` and `next` are preserved so the user lands back where they started.
 */
export function oauthInitFailureRedirect(
  request: NextRequest,
  code: OAuthErrorCode,
  mode: OAuthFlowMode
): NextResponse {
  const target = new URL(mode === "signup" ? "/signup" : "/login", request.nextUrl.origin);
  target.searchParams.set("oauth_error", code);
  const next = safeOAuthNextPath(request.nextUrl.searchParams.get("next"));
  if (next) target.searchParams.set("next", next);
  // 303: the browser must follow with GET regardless of the original method.
  return NextResponse.redirect(target, 303);
}

/** Reads the flow mode without importing the route-local helper. */
export function readOAuthMode(raw: string | null): OAuthFlowMode {
  if (raw === "signup") return "signup";
  if (raw === "link") return "link";
  if (raw === "reauth") return "reauth";
  return "login";
}
