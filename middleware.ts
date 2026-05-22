import { NextResponse, type NextRequest } from "next/server";

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
    "form-action 'self'"
  ].join("; ");
}

function isLocalDev(request: NextRequest) {
  const { hostname } = request.nextUrl;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

const bypassAssetPattern = /\.(ico|png|jpg|jpeg|svg|webp|css|js|map)$/i;

export function shouldBypassMiddleware(pathname: string) {
  return (
    pathname === "/api/health" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/_next/") ||
    bypassAssetPattern.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  if (shouldBypassMiddleware(request.nextUrl.pathname)) {
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

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", buildCsp(nonce, isDev));
  return response;
}

export const config = {
  matcher: ["/((?!api/health$|robots\\.txt$|sitemap\\.xml$|_next/|.*\\.(?:ico|png|jpg|jpeg|svg|webp|css|js|map)$).*)"]
};
