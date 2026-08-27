import "server-only";

import crypto from "node:crypto";
import { importPKCS8, SignJWT } from "jose";

export const ORCHESTRA_SSO_AUDIENCE = "serv1.behalfid.com";
export const ORCHESTRA_SSO_ISSUER = "https://console.behalfid.com";
export const ORCHESTRA_SSO_PRODUCTION_CALLBACK = "https://serv1.behalfid.com/auth/callback";
export const ORCHESTRA_SSO_TTL_SECONDS = 60;

const STATE_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function validateOrchestraSsoState(value: unknown): string | null {
  return typeof value === "string" && STATE_PATTERN.test(value) ? value : null;
}

export function getOrchestraSsoCallbackUrl(): string {
  const configured = process.env.BEHALFID_ORCHESTRA_SSO_CALLBACK_URL?.trim();
  if (!configured) return ORCHESTRA_SSO_PRODUCTION_CALLBACK;
  if (process.env.NODE_ENV === "production") {
    if (configured !== ORCHESTRA_SSO_PRODUCTION_CALLBACK) {
      throw new Error("Invalid Orchestra SSO callback configuration.");
    }
    return configured;
  }

  const url = new URL(configured);
  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (
    !localHost ||
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/auth/callback" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid Orchestra SSO development callback configuration.");
  }
  return url.toString();
}

async function getSigningKey() {
  const pem = process.env.BEHALFID_ORCHESTRA_SSO_PRIVATE_KEY?.trim();
  if (!pem) throw new Error("Orchestra SSO signing is not configured.");
  try {
    return await importPKCS8(pem.replace(/\\n/g, "\n"), "EdDSA");
  } catch {
    throw new Error("Orchestra SSO signing configuration is invalid.");
  }
}

function getSigningKeyId() {
  const keyId = process.env.BEHALFID_ORCHESTRA_SSO_KEY_ID?.trim() ?? "";
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error("Orchestra SSO key ID configuration is missing or invalid.");
  }
  return keyId;
}

export async function issueOrchestraSsoAssertion(input: { adminId: string; state: string; now?: Date }) {
  const state = validateOrchestraSsoState(input.state);
  if (!state) throw new Error("Invalid Orchestra SSO state.");
  if (!input.adminId) throw new Error("An attributable console admin is required.");

  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const jti = crypto.randomBytes(18).toString("base64url");
  const keyId = getSigningKeyId();
  const assertion = await new SignJWT({ state })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: keyId })
    .setIssuer(ORCHESTRA_SSO_ISSUER)
    .setAudience(ORCHESTRA_SSO_AUDIENCE)
    .setSubject(input.adminId)
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(now + ORCHESTRA_SSO_TTL_SECONDS)
    .sign(await getSigningKey());

  return { assertion, jti, keyId, issuedAt: now, expiresAt: now + ORCHESTRA_SSO_TTL_SECONDS };
}
