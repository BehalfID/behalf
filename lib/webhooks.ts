import crypto from "crypto";
import net from "net";
import { createPublicId, createWebhookSecret } from "@/lib/ids";
import { enqueueWebhookEventRecord } from "@/lib/repositories/webhooks";

export const WEBHOOK_EVENT_TYPES = [
  "verification.allowed",
  "verification.denied",
  "verification.approval_required",
  "verification.shadow",
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
    const addr = normalizedAddress;
    // Loopback / unspecified
    if (addr === "::" || addr === "::1") return true;
    // Unique Local (fc00::/7)
    if (addr.startsWith("fc") || addr.startsWith("fd")) return true;
    // Link-local (fe80::/10)
    if (addr.startsWith("fe8") || addr.startsWith("fe9") || addr.startsWith("fea") || addr.startsWith("feb")) return true;
    // Multicast (ff00::/8)
    if (addr.startsWith("ff")) return true;
    // IPv4-mapped (::ffff:/96) — compressed form
    if (addr.startsWith("::ffff:")) return true;
    // IPv4-mapped — full form: 0:0:0:0:0:ffff:x.x.x.x or 0000:...:ffff:x.x.x.x
    if (/^(?:0+:){5}ffff:/i.test(addr)) return true;
    // NAT64 (64:ff9b::/96) — could translate private IPv4 addresses
    if (addr.startsWith("64:ff9b:")) return true;
    return false;
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
  await enqueueWebhookEventRecord({
    eventId: event.eventId,
    accountId: event.accountId,
    developerUserId: event.developerUserId,
    type: event.type,
    payload: event
  });
}

/**
 * Derive the effective HMAC signing key from the stored secretHash.
 * When BEHALFID_WEBHOOK_SIGNING_PEPPER is set, the key is derived as
 * HMAC-SHA256(pepper, secretHash) so that the value stored in the database
 * is not sufficient on its own to forge signatures — the pepper must also
 * be known. Generate the pepper with: openssl rand -hex 32
 */
function deriveSigningKey(secretHash: string): string {
  const pepper = process.env.BEHALFID_WEBHOOK_SIGNING_PEPPER?.trim();
  if (pepper) {
    return crypto.createHmac("sha256", pepper).update(secretHash).digest("hex");
  }
  return secretHash;
}

export function signWebhookPayload(secretHash: string, timestamp: string, rawBody: string) {
  const key = deriveSigningKey(secretHash);
  return crypto.createHmac("sha256", key).update(`${timestamp}.${rawBody}`).digest("hex");
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
