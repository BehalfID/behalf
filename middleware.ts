import { NextResponse, type NextRequest } from "next/server";

const CSP_PRODUCTION = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

// Development relaxations (applied when running on localhost):
// - 'unsafe-eval': React dev mode uses eval() for call-stack reconstruction
// - fonts.googleapis.com / fonts.gstatic.com: next/font/google fetches from
//   Google's CDN in dev mode; production builds self-host the font files
const CSP_DEV = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

function isLocalDev(request: NextRequest) {
  const { hostname } = request.nextUrl;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", isLocalDev(request) ? CSP_DEV : CSP_PRODUCTION);
  return response;
}

export const config = {
  matcher: "/(.*)"
};
