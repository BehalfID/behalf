import { NextResponse, type NextRequest } from "next/server";
import type { OAuthErrorCode } from "@/lib/authProviders/oauthErrors";
import { safeOAuthNextPath } from "@/lib/authProviders/oauthState";
import { resolveOwnedHref } from "@/lib/subdomainRouting";
import type { OAuthFlowMode } from "@/lib/repositories/postgres/oauthAuthorizationStates";

/**
 * Where a failed provider *initiation* sends the user, per flow mode.
 *
 * These mirror the destinations the OAuth **callback** already uses on failure
 * (`app/api/auth/github/callback/route.ts`): public flows return to the entry
 * screen, and authenticated flows return to account security — an authenticated
 * link or reauth must never dump the user on the public login page.
 */
const SETTINGS_PATH = "/dashboard/settings";
/** Matches the callback's deep link into the account-security section. */
const SETTINGS_HASH = "account-security";

function destinationFor(mode: OAuthFlowMode): string {
  switch (mode) {
    case "signup":
      return "/signup";
    case "link":
    case "reauth":
      return SETTINGS_PATH;
    case "login":
    default:
      return "/login";
  }
}

/**
 * Builds the visible failure response for a provider *initiation* route.
 *
 * These routes are only ever reached by a top-level navigation from an anchor
 * ("Continue with GitHub"). If one throws, Next.js emits a zero-byte 500 with
 * no `Content-Type`; a browser asked to navigate to an untyped, unrenderable
 * response can offer it as a file download instead of showing anything — which
 * is both alarming and undebuggable for the user.
 *
 * So every failure here becomes a redirect carrying a stable `oauth_error`
 * code that the auth client and settings surface already render via
 * `oauthErrorMessage()`. A redirect can never be downloaded.
 *
 * A validated `next` is preserved; external and protocol-relative values are
 * dropped by `safeOAuthNextPath`. The target is resolved to its owning host so
 * an auth-host initiation lands on the app host for `/dashboard/settings`,
 * exactly as the callback does.
 */
export function oauthInitFailureRedirect(
  request: NextRequest,
  code: OAuthErrorCode,
  mode: OAuthFlowMode
): NextResponse {
  const path = destinationFor(mode);
  const next = safeOAuthNextPath(request.nextUrl.searchParams.get("next"));

  const params = new URLSearchParams({ oauth_error: code });
  if (next) params.set("next", next);
  const pathWithSearch = `${path}?${params.toString()}`;

  const resolved = resolveOwnedHref(pathWithSearch, {
    hostname: request.nextUrl.hostname,
    protocol: request.nextUrl.protocol
  });
  const target = new URL(
    resolved.startsWith("http") ? resolved : pathWithSearch,
    request.nextUrl.origin
  );
  if (path === SETTINGS_PATH) target.hash = SETTINGS_HASH;

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
