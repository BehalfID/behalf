import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { PRIVATE_NO_STORE } from "./lib/cachePolicy";
import {
  WORKSPACE_SLUG_HEADER,
  WORKSPACE_SLUG_PATTERN,
  isReservedWorkspaceSlug,
  validateWorkspaceSlug
} from "./lib/workspaceSlug";

const intlMiddleware = createMiddleware(routing);

// Paths that skip locale routing (console, dashboard, auth helpers, etc.)
const intlBypassPattern =
  /^\/(api|dashboard|console|passport|authenticate|logout|onboarding|design-system|invite|workspace|home-v2)(\/|$)/;

export function shouldBypassIntl(pathname: string) {
  return intlBypassPattern.test(pathname);
}

// 'unsafe-inline' is retained for style-src only — React/Next.js inline styles
// require it. For script-src, 'unsafe-inline' is dropped in favour of a per-request
// nonce. Next.js reads the x-nonce request header and applies the nonce to all
// inline script tags it generates during streaming SSR.
function buildCsp(nonce: string, isDev: boolean) {
  const scriptSrc = isDev
    ? `'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`
    : `'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'`;
  // 'strict-dynamic' causes compliant browsers to ignore 'unsafe-inline',
  // allowing scripts loaded by a nonced script to run. 'unsafe-inline' is
  // kept as a fallback for browsers that don't support strict-dynamic.

  const styleSrc = isDev
    ? `'self' 'unsafe-inline' https://fonts.googleapis.com`
    : `'self' 'unsafe-inline'`;

  const fontSrc = isDev
    ? `'self' https://fonts.gstatic.com`
    : `'self'`;

  return [
    "default-src 'self'",
    `script-src 'self' ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data:",
    `font-src ${fontSrc}`,
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Collect violations server-side so injection attempts are visible in logs.
    // Omitted in dev to avoid noise from hot-reload and eval.
    ...(isDev ? [] : ["report-uri /api/csp-report"])
  ].join("; ");
}

function isLocalDev(request: NextRequest) {
  const { hostname } = request.nextUrl;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

const staticAssetExtensionPattern = /\.(ico|png|jpg|jpeg|svg|webp|css|js|map|sh|txt)$/i;

function isStaticAssetPath(pathname: string): boolean {
  // Extension-like resource IDs under /api/** must still pass through sanitization.
  if (pathname.startsWith("/api/")) return false;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[1] === "api") return false;
  return staticAssetExtensionPattern.test(pathname);
}

export function shouldBypassProxy(pathname: string) {
  return (
    pathname === "/api/health" ||
    pathname === "/api/health/db" ||
    pathname === "/api/status" ||
    pathname === "/api/csp-report" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/_next/") ||
    isStaticAssetPath(pathname)
  );
}

const privatePagePattern =
  /^\/(?:authenticate|console|dashboard|forgot-password|invite|login|logout|onboarding|passport|reset-password|signup|verify-email|workspace)(?:\/|$)/;

/** Explicit defense-in-depth for request-specific HTML and every non-public API. */
export function shouldUsePrivateNoStore(pathname: string): boolean {
  return (
    (pathname.startsWith("/api/") && pathname !== "/api/status") ||
    privatePagePattern.test(pathname)
  );
}

/**
 * Public workspace URLs:
 *   /<slug>/dashboard[/...]  →  /workspace/<slug>/dashboard[/...]
 *   /<slug>/api/dashboard/... →  /api/dashboard/... + trusted slug header
 *
 * Reserved first segments and invalid slugs are never rewritten.
 */
export function matchWorkspacePublicPath(pathname: string): {
  slug: string;
  kind: "dashboard" | "api";
  suffix: string;
} | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const slug = parts[0]?.toLowerCase() ?? "";
  if (!slug || isReservedWorkspaceSlug(slug) || !WORKSPACE_SLUG_PATTERN.test(slug)) {
    return null;
  }
  if (validateWorkspaceSlug(slug) !== null) return null;

  if (parts[1] === "dashboard") {
    const suffix = parts.length > 2 ? `/${parts.slice(2).join("/")}` : "";
    return { slug, kind: "dashboard", suffix };
  }

  if (parts[1] === "api" && (parts[2] === "dashboard" || parts[2] === "billing")) {
    const suffix = `/${parts.slice(1).join("/")}`;
    return { slug, kind: "api", suffix };
  }

  return null;
}

export function buildWorkspaceRewritePath(match: {
  slug: string;
  kind: "dashboard" | "api";
  suffix: string;
}): string {
  if (match.kind === "dashboard") {
    return `/workspace/${match.slug}/dashboard${match.suffix}`;
  }
  return match.suffix;
}

function withCsp(
  response: NextResponse,
  nonce: string,
  isDev: boolean,
  privateNoStore = false
) {
  response.headers.set("Content-Security-Policy", buildCsp(nonce, isDev));
  if (privateNoStore) {
    response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldBypassProxy(pathname)) {
    return NextResponse.next();
  }

  const array = new Uint8Array(16);
  globalThis.crypto.getRandomValues(array);
  const nonce = btoa(String.fromCharCode(...array));
  const isDev = isLocalDev(request);

  // Inject the nonce into the request headers so Next.js server components
  // (and the RSC streaming runtime) can read it via headers().get("x-nonce").
  // Strip any client-supplied workspace slug header so only proxy rewrites can set it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.delete(WORKSPACE_SLUG_HEADER);

  const workspaceMatch = matchWorkspacePublicPath(pathname);
  if (workspaceMatch) {
    const rewritePath = buildWorkspaceRewritePath(workspaceMatch);
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = rewritePath;
    // Preserve query string via clone.

    if (workspaceMatch.kind === "api") {
      requestHeaders.set(WORKSPACE_SLUG_HEADER, workspaceMatch.slug);
    }

    const response = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders }
    });
    return withCsp(response, nonce, isDev, true);
  }

  // Run next-intl locale routing for public pages.
  if (!shouldBypassIntl(pathname)) {
    const intlResponse = intlMiddleware(request);

    // If next-intl issued a redirect (locale prefix missing or wrong), honour it.
    if (intlResponse.status >= 300 && intlResponse.status < 400) {
      return withCsp(
        intlResponse,
        nonce,
        isDev,
        shouldUsePrivateNoStore(pathname)
      );
    }

    // If next-intl issued an internal rewrite (e.g. / → /en for the default
    // locale with localePrefix:'as-needed'), recreate the rewrite so Next.js
    // routes to app/[locale]/page.tsx instead of app/page.tsx, while still
    // injecting the nonce into the request headers.
    const rewriteUrl = intlResponse.headers.get("x-middleware-rewrite");
    if (rewriteUrl) {
      const response = NextResponse.rewrite(new URL(rewriteUrl), {
        request: { headers: requestHeaders }
      });
      intlResponse.cookies.getAll().forEach((c) => response.cookies.set(c.name, c.value, c));
      return withCsp(
        response,
        nonce,
        isDev,
        shouldUsePrivateNoStore(pathname)
      );
    }

    // Pure pass-through: replace with our nonce-injected response and carry over
    // any cookies next-intl set (e.g. the locale-preference cookie).
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    intlResponse.cookies.getAll().forEach((c) => response.cookies.set(c.name, c.value, c));
    return withCsp(
      response,
      nonce,
      isDev,
      shouldUsePrivateNoStore(pathname)
    );
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return withCsp(
    response,
    nonce,
    isDev,
    shouldUsePrivateNoStore(pathname)
  );
}

export const config = {
  matcher: [
    // All API routes — including extension-like resource identifiers.
    "/api/:path*",
    "/:slug/api/:path*",
    // Remaining app routes except health, sitemap, _next, and non-API static assets.
    "/((?!api/health$|api/health/db$|api/status$|robots\\.txt$|sitemap\\.xml$|_next/)(?!.*\\.(?:ico|png|jpg|jpeg|svg|webp|css|js|map|sh|txt)$).*)"
  ]
};
