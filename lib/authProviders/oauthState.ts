import crypto from "crypto";
import { timingSafeEqualString } from "@/lib/crypto";
import { createPublicId } from "@/lib/ids";
import OAuthAuthorizationState, {
  type OAuthFlowMode
} from "@/models/OAuthAuthorizationState";
import type { ExternalIdentityProvider } from "@/models/ExternalIdentity";

/** Authorization requests are short-lived; a user completes a redirect in seconds. */
export const OAUTH_STATE_TTL_MS = 1000 * 60 * 10;

/** Cookie holding the same state secret, binding the callback to this browser. */
export const OAUTH_STATE_COOKIE = "behalfid_oauth_state";

/** Cookie carrying the one-time token for a provider signup awaiting completion. */
export const OAUTH_PENDING_SIGNUP_COOKIE = "behalfid_oauth_pending";

/**
 * Cookie carrying an MFA challenge across an OAuth redirect.
 *
 * Password sign-in hands the challenge token to the client in a JSON response.
 * A provider callback can only reply with a redirect, and putting the token in
 * the query string would write it to history, referrers, and proxy logs.
 */
export const OAUTH_MFA_COOKIE = "behalfid_oauth_mfa";

/** Pending signups are abandoned far more often than completed; keep the window short. */
export const OAUTH_PENDING_SIGNUP_TTL_MS = 1000 * 60 * 15;

/**
 * Cookie attributes for every OAuth-flow cookie.
 *
 * `lax` rather than `strict` because the provider redirect is a cross-site
 * top-level navigation: `strict` would withhold the cookie exactly when the
 * callback needs it, and the CSRF protection here comes from matching the
 * cookie against the provider-returned state, not from the SameSite mode.
 */
export function oauthCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
    path: "/"
  };
}

export function clearedOAuthCookie() {
  return { ...oauthCookieOptions(0), maxAge: 0 };
}

export type ConsumedOAuthState = {
  stateId: string;
  provider: ExternalIdentityProvider;
  mode: OAuthFlowMode;
  codeVerifier: string;
  next: string | null;
  userId: string | null;
};

function oauthStateSigningKey(): Buffer {
  const secret =
    process.env.BEHALFID_SETUP_TOKEN?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    "dev-oauth-state-signing";
  return crypto.createHash("sha256").update(`behalfid-oauth-state:${secret}`).digest();
}

/** HMAC keeps stored state lookup one-way without using a fast password hash. */
export function hashOAuthState(state: string): string {
  return crypto.createHmac("sha256", oauthStateSigningKey()).update(state).digest("hex");
}

/** 256 bits of entropy, URL-safe. Far beyond guessing range for a 10-minute window. */
export function generateOAuthStateSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Only same-origin, non-protocol-relative paths may be used as a return target. */
export function safeOAuthNextPath(next?: string | null): string | undefined {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  if (next.length > 512) return undefined;
  return next;
}

/**
 * Persists a new authorization state and returns the secret to send as `state`
 * plus the PKCE challenge. Only the hash of the secret is stored, so reading
 * the collection does not yield a usable state.
 */
export async function createOAuthState(options: {
  provider: ExternalIdentityProvider;
  mode: OAuthFlowMode;
  next?: string | null;
  userId?: string | null;
}): Promise<{ state: string; codeChallenge: string; stateId: string }> {
  const state = generateOAuthStateSecret();
  const { verifier, challenge } = createPkcePair();
  const stateId = createPublicId("oas");

  await OAuthAuthorizationState.create({
    stateId,
    provider: options.provider,
    mode: options.mode,
    stateHash: hashOAuthState(state),
    codeVerifier: verifier,
    next: safeOAuthNextPath(options.next) ?? null,
    userId: options.userId ?? null,
    consumedAt: null,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS)
  });

  return { state, codeChallenge: challenge, stateId };
}

/**
 * Atomically consumes an authorization state.
 *
 * Both halves must agree: the `state` returned by the provider and the copy
 * held in an httpOnly cookie. The provider copy proves the redirect came from
 * the authorization we started; the cookie copy proves it landed in the same
 * browser that started it, which is what stops a login-CSRF attacker from
 * pasting their own callback URL into a victim's session.
 *
 * The conditional update (`consumedAt: null`) makes consumption single-use even
 * under concurrent replay: only one caller can win the update.
 */
export async function consumeOAuthState(options: {
  provider: ExternalIdentityProvider;
  stateFromProvider: string | null | undefined;
  stateFromCookie: string | null | undefined;
}): Promise<ConsumedOAuthState | null> {
  const fromProvider = options.stateFromProvider?.trim();
  const fromCookie = options.stateFromCookie?.trim();
  if (!fromProvider || !fromCookie) return null;
  if (!timingSafeEqualString(fromProvider, fromCookie)) return null;

  const now = new Date();
  const record = await OAuthAuthorizationState.findOneAndUpdate(
    {
      stateHash: hashOAuthState(fromProvider),
      provider: options.provider,
      consumedAt: null,
      expiresAt: { $gt: now }
    },
    { $set: { consumedAt: now } },
    { new: true }
  )
    .select("+codeVerifier +stateHash")
    .lean();

  if (!record) return null;

  return {
    stateId: record.stateId,
    provider: record.provider as ExternalIdentityProvider,
    mode: record.mode as OAuthFlowMode,
    codeVerifier: record.codeVerifier,
    next: record.next ?? null,
    userId: record.userId ?? null
  };
}

/** Best-effort cleanup for environments without TTL index support. */
export async function purgeExpiredOAuthStates(now = new Date()) {
  return OAuthAuthorizationState.deleteMany({ expiresAt: { $lte: now } });
}
