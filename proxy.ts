import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Paths that skip locale routing (console, dashboard, auth helpers, etc.)
const intlBypassPattern = /^\/(api|dashboard|console|passport|authenticate|logout|onboarding|design-system)(\/|$)/;

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

const bypassAssetPattern = /\.(ico|png|jpg|jpeg|svg|webp|css|js|map)$/i;

export function shouldBypassProxy(pathname: string) {
  return (
    pathname === "/api/health" ||
    pathname === "/api/health/db" ||
    pathname === "/api/csp-report" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/_next/") ||
    bypassAssetPattern.test(pathname)
  );
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
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // Run next-intl locale routing for public pages.
  if (!intlBypassPattern.test(pathname)) {
    const intlResponse = intlMiddleware(request);

    // If next-intl issued a redirect (locale prefix missing or wrong), honour it.
    if (intlResponse.status >= 300 && intlResponse.status < 400) {
      intlResponse.headers.set("Content-Security-Policy", buildCsp(nonce, isDev));
      return intlResponse;
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
      intlResponse.cookies.getAll().forEach(c => response.cookies.set(c.name, c.value, c));
      response.headers.set("Content-Security-Policy", buildCsp(nonce, isDev));
      return response;
    }

    // Pure pass-through: replace with our nonce-injected response and carry over
    // any cookies next-intl set (e.g. the locale-preference cookie).
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    intlResponse.cookies.getAll().forEach(c => response.cookies.set(c.name, c.value, c));
    response.headers.set("Content-Security-Policy", buildCsp(nonce, isDev));
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", buildCsp(nonce, isDev));
  return response;
}

export const config = {
  matcher: [
    "/((?!api/health$|api/health/db$|robots\\.txt$|sitemap\\.xml$|_next/|.*\\.(?:ico|png|jpg|jpeg|svg|webp|css|js|map)$).*)"
  ]
};
