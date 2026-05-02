import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/responses";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const REDIS_PREFIX = "behalfid:rate-limit";

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

export function getRateLimitMode() {
  return process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
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
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Rate limiter backend error.");
  }

  return (await response.json()) as { result: T };
}

async function checkRedisRateLimit(key: string) {
  const redisKey = `${REDIS_PREFIX}:${key}`;
  try {
    const increment = await redisCommand<number>(["INCR", redisKey]);
    const count = Number(increment?.result ?? 0);

    if (count === 1) {
      await redisCommand<number>(["EXPIRE", redisKey, String(Math.ceil(WINDOW_MS / 1000))]);
    } else {
      const ttl = await redisCommand<number>(["TTL", redisKey]);
      if (Number(ttl?.result) === -1) {
        await redisCommand<number>(["EXPIRE", redisKey, String(Math.ceil(WINDOW_MS / 1000))]);
      }
    }

    return { limited: count > MAX_REQUESTS };
  } catch {
    return { limited: true };
  }
}

function checkMemoryRateLimit(key: string) {
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

export async function checkRateLimit(request: NextRequest, apiKeyHash?: string) {
  const key = getRateLimitKey(request, apiKeyHash);
  if (getRateLimitMode() === "redis") {
    return checkRedisRateLimit(key);
  }

  return checkMemoryRateLimit(key);
}

export function rateLimitError() {
  return jsonError("Rate limit exceeded.", 429);
}
