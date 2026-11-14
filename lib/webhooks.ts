import crypto from "crypto";
import net from "net";
import { createPublicId, createWebhookSecret } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { createEvent } from "@/lib/repositories/webhooks";

export const WEBHOOK_EVENT_TYPES = [
  "verification.allowed",
  "verification.denied",
  "verification.approval_required",
  "verification.shadow",
  "approval.requested",
  "approval.approved",
  "approval.denied",
  "approval.used",
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
    const hextets = parseIpv6Hextets(normalizedAddress);
    // net.isIP accepted it, so this should never fail — fail closed if it does.
    if (!hextets) return true;
    return isPrivateIpv6(hextets);
  }

  return false;
}

/**
 * Expands an IPv6 literal (any textual form: compressed, uncompressed, with an
 * embedded dotted IPv4 tail, or with a zone id) into its eight 16-bit groups.
 * Prefix checks on the raw string are bypassable because the same address has
 * many spellings (e.g. `0::ffff:127.0.0.1` is `::ffff:7f00:1`).
 */
function parseIpv6Hextets(address: string): number[] | null {
  let addr = address.split("%")[0];
  const lastColon = addr.lastIndexOf(":");
  const maybeV4 = addr.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    if (net.isIP(maybeV4) !== 4) return null;
    const [a, b, c, d] = maybeV4.split(".").map(Number);
    // Rewrite the dotted tail as two hex groups so the rest parses uniformly.
    addr = `${addr.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) => (part ? part.split(":").map((group) => parseInt(group, 16)) : []);
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const explicit = head.length + rest.length;
  if (halves.length === 1 && explicit !== 8) return null;
  if (halves.length === 2 && explicit > 7) return null;
  const zeros = new Array(8 - explicit).fill(0);
  const groups = halves.length === 2 ? [...head, ...zeros, ...rest] : head;
  if (groups.length !== 8 || groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
    return null;
  }
  return groups;
}

function embeddedIpv4(high: number, low: number) {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isPrivateIpv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5] = groups;
  const firstSixZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0;

  // ::/128 unspecified, ::1 loopback, and the deprecated IPv4-compatible ::/96.
  if (firstSixZero) return true;
  // IPv4-mapped ::ffff:0:0/96 and IPv4-translated ::ffff:0:0:0/96.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return true;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) return true;
  // NAT64 well-known (64:ff9b::/96) and local-use (64:ff9b:1::/48) prefixes.
  if (g0 === 0x64 && g1 === 0xff9b) return true;
  // Discard-only 100::/64.
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true;
  // 2001::/23 IETF special-purpose (incl. Teredo 2001::/32, which tunnels IPv4) and 2001:db8::/32 documentation.
  if (g0 === 0x2001 && (g1 < 0x200 || g1 === 0xdb8)) return true;
  // 6to4 2002::/16 embeds an IPv4 address in groups 1–2.
  if (g0 === 0x2002 && isPrivateIpAddress(embeddedIpv4(g1, g2))) return true;
  // Unique local fc00::/7.
  if ((g0 & 0xfe00) === 0xfc00) return true;
  // Link-local fe80::/10 and deprecated site-local fec0::/10.
  if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true;
  // Multicast ff00::/8.
  if ((g0 & 0xff00) === 0xff00) return true;
  return false;
}

export function createWebhookEvent(
  accountId: string | null | undefined,
  type: WebhookEventType,
  data: Record<string, unknown>,
  developerUserId?: string | null
) {
  // `accountId` must be a real account. It previously fell back to the
  // developer's user id, which Mongo accepted silently — but on Postgres
  // `webhook_events.account_id` is NOT NULL *and* a foreign key to
  // `accounts.account_id`, so a `usr_…` id raised SQLSTATE 23503. Callers that
  // cannot name an account must not emit an account-scoped event at all.
  if (!accountId) {
    logger.warn("webhook_event_skipped_no_account", { type, developerUserId: developerUserId ?? null });
    return null;
  }

  return {
    eventId: createPublicId("evt"),
    type,
    createdAt: new Date().toISOString(),
    accountId,
    developerUserId: developerUserId ?? undefined,
    data
  } satisfies WebhookEvent;
}

/**
 * Fire-and-forget notification enqueue.
 *
 * Deliberately never throws. Webhook delivery is a *nonessential downstream
 * side effect*: callers await it after the primary mutation has already
 * committed, so letting it throw turned a successful write into an unhandled
 * 500. For agent creation that was destructive — the agent and its API-key
 * hash were committed, but the one-time plaintext key only ever existed in the
 * response body that was then never sent, making the credential unrecoverable.
 *
 * Failures are logged with a stable scope and the database error code so they
 * stay diagnosable and alertable rather than silent. Use `enqueueWebhookEvent`
 * directly where the caller genuinely needs the failure to propagate (the
 * delivery worker does).
 */
export async function emitWebhookEvent(event: WebhookEvent | null): Promise<boolean> {
  if (!event) {
    return false;
  }

  try {
    await enqueueWebhookEvent(event);
    return true;
  } catch (error) {
    const detail = error as { name?: string; message?: string; code?: unknown; constraint?: unknown };
    logger.error("webhook_event_enqueue_failed", {
      eventId: event.eventId,
      type: event.type,
      accountId: event.accountId,
      error: detail?.message,
      name: detail?.name,
      ...(detail?.code === undefined ? {} : { code: detail.code }),
      ...(detail?.constraint === undefined ? {} : { constraint: detail.constraint })
    });
    return false;
  }
}

export async function enqueueWebhookEvent(event: WebhookEvent) {
  await createEvent({
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

/**
 * Derive the effective HMAC signing key from the stored secretHash.
 * When BEHALFID_WEBHOOK_SIGNING_PEPPER is set, the key is derived as
 * HMAC-SHA256(pepper, secretHash) so that the value stored in the database
 * is not sufficient on its own to forge signatures — the pepper must also
 * be known. Generate the pepper with: openssl rand -hex 32
 */
let warnedMissingSigningPepperInProduction = false;

function deriveSigningKey(secretHash: string): string {
  const pepper = process.env.BEHALFID_WEBHOOK_SIGNING_PEPPER?.trim();
  if (pepper) {
    return crypto.createHmac("sha256", pepper).update(secretHash).digest("hex");
  }

  if (process.env.NODE_ENV === "production" && !warnedMissingSigningPepperInProduction) {
    warnedMissingSigningPepperInProduction = true;
    console.error(
      "[behalfid] BEHALFID_WEBHOOK_SIGNING_PEPPER is not set: webhook HMAC keys equal the " +
        "secret_hash stored in Postgres, so DB read access alone is sufficient to forge signed " +
        "webhook events. Generate one with: openssl rand -hex 32"
    );
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
