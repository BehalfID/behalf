/**
 * WebAuthn relying-party configuration derived from APP_BASE_URL.
 *
 * Production credentials must bind to the intended BehalfID apex (typically
 * behalfid.com), never to a Vercel preview hostname. Preview deployments can
 * exercise localhost-style flows only when the configured base is localhost;
 * arbitrary preview origins are rejected rather than accepted by weakening RP
 * validation.
 *
 * With subdomain routing, login ceremonies run on auth.* and registration from
 * dashboard settings runs on app.* — both must be listed as expectedOrigins
 * while RP ID stays the apex domain.
 */

import {
  isSubdomainRoutingEnabled,
  resolveSubdomainHosts
} from "@/lib/subdomainRouting";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

/**
 * Canonical public origin for WebAuthn RP derivation.
 * Prefers APP_BASE_URL (server-controlled) over NEXT_PUBLIC_APP_URL.
 */
export function webAuthnConfiguredOrigin(): string | null {
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!raw) return null;
  try {
    const url = new URL(stripTrailingSlash(raw));
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // http is only acceptable for local development (WebAuthn allows localhost).
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** RP ID is the registrable domain — hostname without port. */
export function webAuthnRpId(origin = webAuthnConfiguredOrigin()): string | null {
  if (!origin) return null;
  try {
    const { hostname } = new URL(origin);
    // Strip leading www. so credentials work for both apex and www if cookies share the domain.
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function webAuthnRpName(): string {
  return process.env.WEBAUTHN_RP_NAME?.trim() || "BehalfID";
}

export function isLocalWebAuthnHost(rpId: string): boolean {
  return rpId === "localhost" || rpId === "127.0.0.1";
}

/**
 * Origins allowed to complete WebAuthn ceremonies.
 *
 * Production: configured APP_BASE_URL origin, https://www.<rpId>, and — when
 * subdomain routing is enabled — the configured auth and app hosts that actually
 * host login/registration ceremonies. Preview hostnames are never accepted
 * unless they are the configured base itself.
 */
export function webAuthnAllowedOrigins(origin = webAuthnConfiguredOrigin()): string[] {
  if (!origin) return [];
  const origins = new Set<string>([origin]);
  try {
    const url = new URL(origin);
    const host = url.hostname.replace(/^www\./, "");
    if (!isLocalWebAuthnHost(host) && url.protocol === "https:") {
      origins.add(`https://${host}`);
      origins.add(`https://www.${host}`);
    }
  } catch {
    /* ignore */
  }

  if (isSubdomainRoutingEnabled()) {
    const hosts = resolveSubdomainHosts();
    for (const key of ["auth", "app", "www"] as const) {
      const host = hosts[key]?.trim().toLowerCase();
      if (!host || isLocalWebAuthnHost(host)) continue;
      origins.add(`https://${host}`);
    }
  }

  return Array.from(origins);
}

export type WebAuthnRuntimeConfig = {
  rpID: string;
  rpName: string;
  origin: string;
  expectedOrigins: string[];
};

export function getWebAuthnConfig(): WebAuthnRuntimeConfig | null {
  const origin = webAuthnConfiguredOrigin();
  const rpID = webAuthnRpId(origin);
  if (!origin || !rpID) return null;
  return {
    rpID,
    rpName: webAuthnRpName(),
    origin,
    expectedOrigins: webAuthnAllowedOrigins(origin)
  };
}

export function isWebAuthnConfigured(): boolean {
  return getWebAuthnConfig() !== null;
}
