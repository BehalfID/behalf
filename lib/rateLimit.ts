import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/responses";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  behalfRateLimitStore?: Map<string, RateLimitEntry>;
  behalfRateLimitLastPruneAt?: number;
};

const store = globalForRateLimit.behalfRateLimitStore ?? new Map<string, RateLimitEntry>();
globalForRateLimit.behalfRateLimitStore = store;

function getIpFallback(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim();
  return ip || request.headers.get("x-real-ip") || "unknown";
}

export function getRateLimitKey(request: NextRequest, apiKeyHash?: string) {
  return apiKeyHash ? `key:${apiKeyHash}` : `ip:${getIpFallback(request)}`;
}

export function checkRateLimit(request: NextRequest, apiKeyHash?: string) {
  const key = getRateLimitKey(request, apiKeyHash);
  const now = Date.now();
  if (
    !globalForRateLimit.behalfRateLimitLastPruneAt ||
    globalForRateLimit.behalfRateLimitLastPruneAt + WINDOW_MS <= now
  ) {
    for (const [entryKey, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(entryKey);
      }
    }
    globalForRateLimit.behalfRateLimitLastPruneAt = now;
  }

  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { limited: false };
  }

  if (current.count >= MAX_REQUESTS) {
    return { limited: true };
  }

  current.count += 1;
  return { limited: false };
}

export function rateLimitError() {
  return jsonError("Rate limit exceeded.", 429);
}
