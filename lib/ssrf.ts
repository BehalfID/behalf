/**
 * Shared SSRF guard utilities.
 *
 * Used by lib/actionGateway.ts (action gateway) and any other server-side
 * code that makes outbound HTTP requests based on operator-configured or
 * user-supplied URLs.
 */

import dns from "dns/promises";
import { isPrivateIpAddress } from "@/lib/webhooks";

export { isPrivateIpAddress };

export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

export function isInternalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "metadata" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    !hostname.includes(".")
  );
}

export type ValidatedPublicUrl = {
  url: URL;
  addresses: Array<{ address: string; family: number }>;
};

/**
 * Validates that a URL is safe to fetch as an outbound HTTP request.
 *
 * Blocks private/loopback/link-local/internal addresses and performs a DNS
 * pre-resolution so callers can pin the connection to the validated IP,
 * preventing DNS-rebinding attacks for the duration of the request.
 *
 * Throws a descriptive `Error` on any violation; callers should catch and
 * rethrow with context-appropriate messages if needed.
 *
 * @param value                  Raw URL string to validate.
 * @param requireHttpsInProd     If true, reject http:// URLs when NODE_ENV === "production".
 */
export async function validatePublicUrl(
  value: string,
  { requireHttpsInProd = false }: { requireHttpsInProd?: boolean } = {}
): Promise<ValidatedPublicUrl> {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("URL is required.");
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("URL must be a valid absolute URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("URL must use http:// or https://.");
  }

  if (requireHttpsInProd && process.env.NODE_ENV === "production" && url.protocol === "http:") {
    throw new Error("URL must use https:// in production.");
  }

  if (url.username || url.password) {
    throw new Error("URL must not include credentials.");
  }

  const hostname = normalizeHostname(url.hostname);

  if (isInternalHostname(hostname)) {
    throw new Error("URL host is not public.");
  }

  if (isPrivateIpAddress(hostname)) {
    throw new Error("URL IP address is not public.");
  }

  const addresses = await dns
    .lookup(hostname, { all: true, verbatim: true })
    .catch(() => [] as Array<{ address: string; family: number }>);

  if (!addresses.length) {
    throw new Error("URL host could not be resolved.");
  }

  if (addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error("URL resolves to a non-public address.");
  }

  url.hash = "";
  url.username = "";
  url.password = "";
  return { url, addresses };
}
