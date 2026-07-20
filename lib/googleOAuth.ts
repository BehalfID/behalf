import crypto from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { hashEmailToken, generateSecureToken } from "@/lib/developerAuth";
import { safeOAuthNextPath, type GoogleOAuthMode } from "@/lib/googleOAuthClient";

export type { GoogleOAuthMode } from "@/lib/googleOAuthClient";
export { googleAuthHref, safeOAuthNextPath } from "@/lib/googleOAuthClient";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const GOOGLE_OAUTH_STATE_COOKIE = "behalfid_google_oauth";
export const GOOGLE_PENDING_SIGNUP_COOKIE = "behalfid_google_pending";
export const PENDING_SIGNUP_TTL_MS = 1000 * 60 * 15;

export type GoogleIdTokenClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
};

type OAuthStatePayload = {
  n: string;
  v: string;
  m: GoogleOAuthMode;
  next?: string;
  exp: number;
};

function appBaseUrl(requestOrigin?: string): string {
  const configured =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    requestOrigin ||
    "";
  return configured.replace(/\/$/, "");
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function getGoogleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null;
}

function stateSigningKey(): Buffer {
  const secret =
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    process.env.BEHALFID_SETUP_TOKEN?.trim() ||
    "dev-google-oauth-state";
  return crypto.createHash("sha256").update(`behalfid-google-oauth:${secret}`).digest();
}

function signState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", stateSigningKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyState(raw: string): OAuthStatePayload | null {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", stateSigningKey()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
    if (!payload?.n || !payload?.v || !payload?.exp || payload.exp < Date.now()) return null;
    if (payload.m !== "login" && payload.m !== "signup") return null;
    return payload;
  } catch {
    return null;
  }
}

export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildGoogleAuthorizeRedirect(options: {
  requestOrigin: string;
  mode: GoogleOAuthMode;
  next?: string | null;
}): { url: string; stateCookieValue: string } | { error: string } {
  const clientId = getGoogleClientId();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return { error: "Google sign-in is not configured." };
  }

  const { verifier, challenge } = createPkcePair();
  const nonce = generateSecureToken(16);
  const next = safeOAuthNextPath(options.next);
  const state = signState({
    n: nonce,
    v: verifier,
    m: options.mode,
    next,
    exp: Date.now() + 1000 * 60 * 10
  });

  const redirectUri = `${appBaseUrl(options.requestOrigin)}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    access_type: "online"
  });

  return {
    url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    stateCookieValue: state
  };
}

export function parseOAuthStateCookie(raw?: string | null): OAuthStatePayload | null {
  if (!raw) return null;
  return verifyState(raw);
}

export async function exchangeGoogleAuthorizationCode(options: {
  code: string;
  codeVerifier: string;
  requestOrigin: string;
}): Promise<{ idToken: string } | { error: string }> {
  const clientId = getGoogleClientId();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return { error: "Google sign-in is not configured." };
  }

  const redirectUri = `${appBaseUrl(options.requestOrigin)}/api/auth/google/callback`;
  const body = new URLSearchParams({
    code: options.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: options.codeVerifier
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    return { error: "Google authentication failed." };
  }

  const json = (await response.json().catch(() => null)) as { id_token?: string } | null;
  if (!json?.id_token || typeof json.id_token !== "string") {
    return { error: "Google authentication failed." };
  }

  return { idToken: json.id_token };
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdTokenClaims | null> {
  const clientId = getGoogleClientId();
  if (!clientId) return null;

  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId
    });

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";
    if (!sub || !email || !emailVerified) return null;

    return {
      sub,
      email,
      email_verified: true,
      given_name: typeof payload.given_name === "string" ? payload.given_name.slice(0, 80) : undefined,
      family_name: typeof payload.family_name === "string" ? payload.family_name.slice(0, 80) : undefined,
      name: typeof payload.name === "string" ? payload.name.slice(0, 160) : undefined
    };
  } catch {
    return null;
  }
}

export function hashPendingSignupToken(token: string) {
  return hashEmailToken(token);
}

export function oauthCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
    path: "/"
  };
}
