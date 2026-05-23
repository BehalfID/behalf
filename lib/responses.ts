import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...details }, { status });
}

/**
 * Return a JSON response that must not be cached by CDNs or browsers.
 * Use for all authenticated, user-specific API routes.
 */
export function noCacheJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
