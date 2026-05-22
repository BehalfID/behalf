/**
 * Next.js Middleware — BehalfID Site Guard enforcement
 *
 * This file is picked up automatically by Next.js as middleware.
 * It runs server-side before any page or route handler is invoked.
 *
 * Behavior
 * --------
 *  - Static assets and Next.js internals are always bypassed.
 *  - Requests to GUARDED_PREFIXES are checked via BehalfID Site Guard.
 *  - If Site Guard allows  → forward the request to the route handler.
 *  - If Site Guard denies  → respond 403 immediately (route never runs).
 *  - If BehalfID is down   → respond 403 (fail closed, route never runs).
 *
 * Environment variables
 * ---------------------
 *  SITE_GUARD_KEY       – Site key from the BehalfID dashboard (required).
 *                         Never expose this to the browser.
 *  BEHALFID_BASE_URL    – Override the BehalfID API base (optional;
 *                         defaults to https://behalfid.com).
 */

import { NextResponse, type NextRequest } from "next/server";
import { checkSiteGuardAccess } from "./lib/site-guard";

// ---------------------------------------------------------------------------
// Configure which path prefixes Site Guard should protect.
// Requests to any other path pass through without a Site Guard check.
// ---------------------------------------------------------------------------
const GUARDED_PREFIXES = ["/docs", "/admin"] as const;

// Static asset extensions that are always bypassed.
const STATIC_ASSET_PATTERN =
  /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|mjs|map|woff|woff2|ttf|eot)$/i;

function shouldGuard(pathname: string): boolean {
  // Always bypass Next.js internals and static assets.
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    STATIC_ASSET_PATTERN.test(pathname)
  ) {
    return false;
  }

  // Only guard the configured prefixes.
  return GUARDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass through routes that are not guarded.
  if (!shouldGuard(pathname)) {
    return NextResponse.next();
  }

  const decision = await checkSiteGuardAccess({
    path: pathname,
    userAgent: request.headers.get("user-agent") ?? "unknown",
    // Forward an optional caller-supplied agent identifier if present.
    agentIdentifier:
      request.headers.get("behalfid-agent") ?? undefined,
  });

  if (!decision.allowed) {
    return new NextResponse(
      decision.reason || "Access denied by Site Guard.",
      {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  // Allowed — proceed to the route handler.
  return NextResponse.next();
}

// ---------------------------------------------------------------------------
// Matcher — Next.js only runs this middleware for the listed path patterns.
// Keep this in sync with GUARDED_PREFIXES above.
// ---------------------------------------------------------------------------
export const config = {
  matcher: [
    "/docs/:path*",
    "/admin/:path*",
  ],
};
