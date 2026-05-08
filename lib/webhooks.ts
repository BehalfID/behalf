import crypto from "crypto";
import net from "net";
import { createPublicId, createWebhookSecret } from "@/lib/ids";
import WebhookEventModel from "@/models/WebhookEvent";

export const WEBHOOK_EVENT_TYPES = [
  "verification.allowed",
  "verification.denied",
  "agent.created",
  "agent.disabled",
  "agent.enabled",
  "agent.key_rotated",
  "permission.created",
  "permission.revoked"
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export type WebhookEvent = {
  eventId: string;
  type: WebhookEventType;
  createdAt: string;
  accountId: string;
  developerUserId?: string;
  data: Record<string, unknown>;
};

export const WEBHOOK_MAX_ATTEMPTS = 5;
export const WEBHOOK_BACKOFF_MS = [0, 5_000, 30_000, 120_000, 600_000] as const;

export function hashWebhookSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function createWebhookSecretPreview(secret: string) {
  return `${secret.slice(0, 10)}...${secret.slice(-6)}`;
}

export function createSigningSecret() {
  const secret = createWebhookSecret();
  return {
    secret,
    secretHash: hashWebhookSecret(secret),
    secretPreview: createWebhookSecretPreview(secret)
  };
}

export function isWebhookEventType(value: string): value is WebhookEventType {
  return WEBHOOK_EVENT_TYPES.includes(value as WebhookEventType);
}

export function validateWebhookEvents(events: unknown) {
  if (!Array.isArray(events) || events.length === 0) {
    return { events: null, error: "events must be a non-empty array." };
  }

  const normalized = [...new Set(events.map((event) => String(event).trim()))];
  const invalid = normalized.find((event) => !isWebhookEventType(event));
  if (invalid) {
    return { events: null, error: `Unsupported webhook event: ${invalid}.` };
  }

  return { events: normalized as WebhookEventType[], error: null };
}

export function validateWebhookUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return { url: null, error: "url is required." };
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { url: null, error: "url must be a valid URL." };
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  const isProduction = process.env.NODE_ENV === "production";

  if (url.username || url.password) {
    return { url: null, error: "Webhook URLs must not include credentials." };
  }

  if (isProduction && url.protocol !== "https:") {
    return { url: null, error: "Webhook URLs must use https:// in production." };
  }

  if (!isProduction && url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
    return { url: null, error: "Webhook URLs must use https://, except localhost over http in development." };
  }

  if (isProduction && isPrivateHostname(hostname)) {
    return { url: null, error: "Webhook URL host is not allowed." };
  }

  url.hash = "";
  url.username = "";
  url.password = "";
  return { url: url.toString(), error: null };
}

export function isPrivateIpAddress(address: string) {
  const normalizedAddress = address.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = net.isIP(normalizedAddress);

  if (ipVersion === 4) {
    const parts = normalizedAddress.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return true;
    }

    const [a, b, c, d] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 ||
      (a === 255 && b === 255 && c === 255 && d === 255)
    );
  }

  if (ipVersion === 6) {
    return (
      normalizedAddress === "::" ||
      normalizedAddress === "::1" ||
      normalizedAddress.startsWith("fc") ||
      normalizedAddress.startsWith("fd") ||
      normalizedAddress.startsWith("fe8") ||
      normalizedAddress.startsWith("fe9") ||
      normalizedAddress.startsWith("fea") ||
      normalizedAddress.startsWith("feb") ||
      normalizedAddress.startsWith("ff") ||
      normalizedAddress.startsWith("::ffff:")
    );
  }

  return false;
}

export function createWebhookEvent(
  accountId: string | null | undefined,
  type: WebhookEventType,
  data: Record<string, unknown>,
  developerUserId?: string | null
) {
  if (!accountId && !developerUserId) {
    return null;
  }

  const eventAccountId = accountId ?? developerUserId;
  if (!eventAccountId) {
    return null;
  }

  return {
    eventId: createPublicId("evt"),
    type,
    createdAt: new Date().toISOString(),
    accountId: eventAccountId,
    developerUserId: developerUserId ?? undefined,
    data
  } satisfies WebhookEvent;
}

export async function emitWebhookEvent(event: WebhookEvent | null) {
  if (!event) {
    return;
  }

  await enqueueWebhookEvent(event);
}

export async function enqueueWebhookEvent(event: WebhookEvent) {
  await WebhookEventModel.create({
    eventId: event.eventId,
    accountId: event.accountId,
    developerUserId: event.developerUserId,
    type: event.type,
    payload: event,
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(),
    deadLetter: false,
    lastError: null,
    completedAt: null
  });
}

export function signWebhookPayload(secretHash: string, timestamp: string, rawBody: string) {
  return crypto.createHmac("sha256", secretHash).update(`${timestamp}.${rawBody}`).digest("hex");
}

function isPrivateHostname(hostname: string) {
  const normalizedHostname =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local") ||
    normalizedHostname.endsWith(".internal")
  ) {
    return true;
  }

  if (isPrivateIpAddress(normalizedHostname)) return true;

  return false;
}
