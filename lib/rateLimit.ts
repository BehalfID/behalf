import crypto from "crypto";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/responses";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const REDIS_PREFIX = "behalfid:rate-limit";

// Auth endpoints: stricter window and lower cap to limit brute-force per identity
const AUTH_WINDOW_MS = 15 * 60_000;
const AUTH_MAX_ATTEMPTS = 10;
const AUTH_REDIS_PREFIX = "behalfid:auth-limit";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

// Milliseconds to wait for a Redis response before giving up and falling back to
// in-process memory limiting.  Keeps individual dashboard API requests fast even
// when the Upstash endpoint is temporarily unreachable.
const REDIS_TIMEOUT_MS = 2000;

const globalForRateLimit = globalThis as typeof globalThis & {
  behalfRateLimitStore?: Map<string, RateLimitEntry>;
  behalfRateLimitLastPruneAt?: number;
  behalfRateLimitWarningEmitted?: boolean;
  behalfRedisErrorWarningEmitted?: boolean;
};

const store = globalForRateLimit.behalfRateLimitStore ?? new Map<string, RateLimitEntry>();
globalForRateLimit.behalfRateLimitStore = store;

function warnRedisErrorOnce() {
  if (globalForRateLimit.behalfRedisErrorWarningEmitted) return;
  globalForRateLimit.behalfRedisErrorWarningEmitted = true;
  console.warn(
    "[behalfid] Redis rate limiter is unreachable or timed out; falling back to in-process memory limiting for this instance."
  );
}

function warnProductionMemoryRateLimitOnce() {
  if (
    process.env.NODE_ENV !== "production" ||
    getRateLimitMode() !== "memory" ||
    globalForRateLimit.behalfRateLimitWarningEmitted
  ) {
    return;
  }

  globalForRateLimit.behalfRateLimitWarningEmitted = true;
  console.warn(
    "[behalfid] Production rate limits are using per-process memory fallback. Set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for shared durable rate limiting."
  );
}

function getIpFallback(request: NextRequest) {
  // x-real-ip is set by Vercel's edge network and cannot be spoofed by the client.
  // Only fall back to x-forwarded-for when TRUST_PROXY_XFF=true is explicitly set,
  // because that header can be injected by the client to bypass rate limiting.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  if (process.env.TRUST_PROXY_XFF === "true") {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim();
    if (ip) return ip;
  }

  return "unknown";
}

export function getRateLimitKey(request: NextRequest, apiKeyHash?: string) {
  return apiKeyHash ? `key:${apiKeyHash}` : `ip:${getIpFallback(request)}`;
}

export function getRateLimitMode() {
  const hasUrl = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim());
  const hasToken = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  return hasUrl && hasToken
    ? "redis"
    : "memory";
}

async function redisCommand<T>(command: string[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/${command.map(encodeURIComponent).join("/")}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store",
    // Short timeout so a slow/unreachable Redis endpoint does not hang the
    // entire request for tens of seconds.  AbortSignal.timeout is available
    // in Node 17.3+ / Node 18 LTS.
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error("Rate limiter backend error.");
  }

  return (await response.json()) as { result: T };
}

async function checkRedisRateLimit(key: string, maxRequests = MAX_REQUESTS, windowMs = WINDOW_MS, prefix = REDIS_PREFIX) {
  const redisKey = `${prefix}:${key}`;
  try {
    const increment = await redisCommand<number>(["INCR", redisKey]);
    const count = Number(increment?.result ?? 0);

    if (count === 1) {
      await redisCommand<number>(["EXPIRE", redisKey, String(Math.ceil(windowMs / 1000))]);
    } else {
      const ttl = await redisCommand<number>(["TTL", redisKey]);
      if (Number(ttl?.result) === -1) {
        await redisCommand<number>(["EXPIRE", redisKey, String(Math.ceil(windowMs / 1000))]);
      }
    }

    return { limited: count > maxRequests };
  } catch {
    // Redis is unreachable or timed out.  Fall back to in-process memory
    // limiting rather than blocking every request with a 429.
    warnRedisErrorOnce();
    return checkMemoryRateLimit(key, maxRequests, windowMs);
  }
}

function checkMemoryRateLimit(key: string, maxRequests = MAX_REQUESTS, windowMs = WINDOW_MS) {
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
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false };
  }

  if (current.count >= maxRequests) {
    return { limited: true };
  }

  current.count += 1;
  return { limited: false };
}

export async function checkRateLimit(request: NextRequest, apiKeyHash?: string) {
  warnProductionMemoryRateLimitOnce();
  const key = getRateLimitKey(request, apiKeyHash);
  if (getRateLimitMode() === "redis") {
    return checkRedisRateLimit(key);
  }

  return checkMemoryRateLimit(key);
}

/**
 * Per-identity rate limit for auth endpoints (login, signup).
 * Keyed by a hashed identifier (email or static key for console) so brute-forcing
 * a single account is throttled independently of the IP-based general limit.
 */
export async function checkAuthRateLimit(identifier: string) {
  const key = `auth:${crypto.createHash("sha256").update(identifier).digest("hex")}`;
  if (getRateLimitMode() === "redis") {
    return checkRedisRateLimit(key, AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS, AUTH_REDIS_PREFIX);
  }

  return checkMemoryRateLimit(key, AUTH_MAX_ATTEMPTS, AUTH_WINDOW_MS);
}

export function rateLimitError() {
  return jsonError("Rate limit exceeded.", 429);
}
