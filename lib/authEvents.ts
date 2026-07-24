import crypto from "crypto";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import AuthEvent, {
  type AuthEventReason,
  type AuthEventSurface
} from "@/models/AuthEvent";

const AUTH_EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const API_KEY_LOG_WINDOW_MS = 60_000;
const API_KEY_LOG_MAX_PER_KEY = 5;

const globalForAuthEvents = globalThis as typeof globalThis & {
  behalfAuthEventApiKeyCaps?: Map<string, { count: number; resetAt: number }>;
};

function apiKeyCaps() {
  if (!globalForAuthEvents.behalfAuthEventApiKeyCaps) {
    globalForAuthEvents.behalfAuthEventApiKeyCaps = new Map();
  }
  return globalForAuthEvents.behalfAuthEventApiKeyCaps;
}

export function clientIpFromRequest(request: NextRequest): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  if (process.env.TRUST_PROXY_XFF === "true") {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim();
    if (ip) return ip;
  }

  return "unknown";
}

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(`ip:${ip}`).digest("hex").slice(0, 32);
}

function emailHint(email: string | undefined | null): string | undefined {
  if (!email || !email.includes("@")) return undefined;
  const [, domain] = email.split("@");
  return domain ? `email:*@${domain.toLowerCase()}` : undefined;
}

function shouldLogApiKeyFailure(identityHint: string | undefined): boolean {
  const key = identityHint ?? "api_key:unknown";
  const now = Date.now();
  const caps = apiKeyCaps();
  const entry = caps.get(key);
  if (!entry || entry.resetAt <= now) {
    caps.set(key, { count: 1, resetAt: now + API_KEY_LOG_WINDOW_MS });
    return true;
  }
  if (entry.count >= API_KEY_LOG_MAX_PER_KEY) {
    return false;
  }
  entry.count += 1;
  return true;
}

export async function recordAuthFailure(input: {
  request?: NextRequest;
  surface: AuthEventSurface;
  reason: AuthEventReason;
  email?: string | null;
  identityHint?: string | null;
  ip?: string;
}): Promise<void> {
  try {
    if (input.surface === "api_key") {
      const hint = input.identityHint ?? undefined;
      if (!shouldLogApiKeyFailure(hint)) {
        return;
      }
    }

    await connectToDatabase();
    const ip = input.ip ?? (input.request ? clientIpFromRequest(input.request) : "unknown");
    await AuthEvent.create({
      eventId: `ae_${crypto.randomBytes(12).toString("hex")}`,
      surface: input.surface,
      outcome: "failure",
      reason: input.reason,
      ipHash: hashIp(ip),
      identityHint: input.identityHint ?? emailHint(input.email) ?? undefined,
      expiresAt: new Date(Date.now() + AUTH_EVENT_TTL_MS)
    });
  } catch (error) {
    logger.warn("auth_event_record_failed", {
      surface: input.surface,
      reason: input.reason,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Ensure payloads never include secrets (used by tests and serializers). */
export function sanitizeAuthEventForRead(event: {
  eventId: string;
  surface: string;
  outcome: string;
  reason: string;
  ipHash: string;
  identityHint?: string | null;
  createdAt?: Date;
}) {
  const json = JSON.stringify(event);
  if (
    /bhf_sk_|bhf_dev_|whsec_|password|Bearer\s/i.test(json) ||
    (event.identityHint && event.identityHint.includes("@") && !event.identityHint.startsWith("email:*@"))
  ) {
    throw new Error("Auth event payload appears to contain a secret or raw email.");
  }
  return event;
}
