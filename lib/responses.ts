import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE } from "@/lib/cachePolicy";

export function jsonError(message: string, status = 400, details?: Record<string, unknown>) {
  const response = NextResponse.json({ error: message, ...details }, { status });
  response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return response;
}

/**
 * Return a JSON response that must not be cached by CDNs or browsers.
 * Use for all authenticated, user-specific API routes.
 */
export function noCacheJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return response;
}
