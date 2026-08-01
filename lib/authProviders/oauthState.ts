import crypto from "crypto";
import { timingSafeEqualString } from "@/lib/crypto";
import { getPostgresDb } from "@/lib/db/postgres";
import { createPublicId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import type { ExternalIdentityProvider } from "@/lib/repositories/postgres/externalIdentities";
import * as oauthStates from "@/lib/repositories/postgres/oauthAuthorizationStates";
import type { OAuthFlowMode } from "@/lib/repositories/postgres/oauthAuthorizationStates";
import { resolveSessionCookieDomain } from "@/lib/subdomainRouting";

export type { OAuthFlowMode };

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
 * the query string would write it to history, referrers, or proxy logs.
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
 *
 * When BEHALFID_COOKIE_DOMAIN is set, Domain is shared across auth/app/www so a
 * host mismatch cannot drop the binding cookie. Prefer fixing redirect_uri to
 * the auth host; Domain is defense in depth.
 */
export function oauthCookieOptions(maxAgeSeconds: number) {
  const domain = resolveSessionCookieDomain();
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
    path: "/",
    ...(domain ? { domain } : {})
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

/** Internal failure classes for structured logs — never shown verbatim to users. */
export type OAuthStateFailureReason =
  | "missing_callback_state"
  | "missing_browser_cookie"
  | "state_cookie_mismatch"
  | "state_not_found"
  | "state_expired"
  | "state_already_consumed"
  | "provider_mismatch"
  | "database_consume_error"
  | "pkce_verifier_missing";

export type OAuthStateConsumeResult =
  | { ok: true; state: ConsumedOAuthState }
  | {
      ok: false;
      reason: OAuthStateFailureReason;
      diagnostics: {
        statePresent: boolean;
        cookiePresent: boolean;
        databaseRowFound: boolean;
        expired: boolean;
        consumed: boolean;
      };
    };

function oauthStateStorageSalt(): string {
  const secret =
    process.env.BEHALFID_SETUP_TOKEN?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    "dev-oauth-state-signing";
  return `behalfid-oauth-state:${secret}`;
}

/** One-way fingerprint for DB lookup; scrypt satisfies CodeQL password-hash rules. */
export function hashOAuthState(state: string): string {
  return crypto.scryptSync(state, oauthStateStorageSalt(), 32).toString("hex");
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

  await oauthStates.createOAuthAuthorizationState(getPostgresDb(), {
    stateId,
    provider: options.provider,
    mode: options.mode,
    stateHash: hashOAuthState(state),
    codeVerifier: verifier,
    next: safeOAuthNextPath(options.next) ?? null,
    userId: options.userId ?? null,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS)
  });

  return { state, codeChallenge: challenge, stateId };
}

function emptyDiagnostics(partial: {
  statePresent: boolean;
  cookiePresent: boolean;
}): {
  statePresent: boolean;
  cookiePresent: boolean;
  databaseRowFound: boolean;
  expired: boolean;
  consumed: boolean;
} {
  return {
    statePresent: partial.statePresent,
    cookiePresent: partial.cookiePresent,
    databaseRowFound: false,
    expired: false,
    consumed: false
  };
}

/**
 * Atomically consumes an authorization state with a classified failure reason.
 *
 * Both halves must agree: the `state` returned by the provider and the copy
 * held in an httpOnly cookie. The conditional update (`consumedAt: null`) makes
 * consumption single-use even under concurrent replay.
 */
export async function consumeOAuthStateDetailed(options: {
  provider: ExternalIdentityProvider;
  stateFromProvider: string | null | undefined;
  stateFromCookie: string | null | undefined;
  now?: Date;
}): Promise<OAuthStateConsumeResult> {
  const fromProvider = options.stateFromProvider?.trim() ?? "";
  const fromCookie = options.stateFromCookie?.trim() ?? "";
  const statePresent = Boolean(fromProvider);
  const cookiePresent = Boolean(fromCookie);
  const now = options.now ?? new Date();

  if (!statePresent) {
    return {
      ok: false,
      reason: "missing_callback_state",
      diagnostics: emptyDiagnostics({ statePresent, cookiePresent })
    };
  }
  if (!cookiePresent) {
    return {
      ok: false,
      reason: "missing_browser_cookie",
      diagnostics: emptyDiagnostics({ statePresent, cookiePresent })
    };
  }
  if (!timingSafeEqualString(fromProvider, fromCookie)) {
    return {
      ok: false,
      reason: "state_cookie_mismatch",
      diagnostics: emptyDiagnostics({ statePresent, cookiePresent })
    };
  }

  const stateHash = hashOAuthState(fromProvider);
  const record = await oauthStates.consumeOAuthAuthorizationState(getPostgresDb(), {
    stateHash,
    provider: options.provider,
    now
  });

  if (record) {
    if (!record.codeVerifier) {
      return {
        ok: false,
        reason: "pkce_verifier_missing",
        diagnostics: {
          statePresent,
          cookiePresent,
          databaseRowFound: true,
          expired: false,
          consumed: true
        }
      };
    }
    return {
      ok: true,
      state: {
        stateId: record.stateId,
        provider: record.provider,
        mode: record.mode,
        codeVerifier: record.codeVerifier,
        next: record.next ?? null,
        userId: record.userId ?? null
      }
    };
  }

  // Classify without leaking secrets: read the row after a failed consume.
  const existing = await oauthStates.findOAuthAuthorizationStateByHash(getPostgresDb(), {
    stateHash
  });
  if (!existing) {
    return {
      ok: false,
      reason: "state_not_found",
      diagnostics: {
        statePresent,
        cookiePresent,
        databaseRowFound: false,
        expired: false,
        consumed: false
      }
    };
  }
  if (existing.provider !== options.provider) {
    return {
      ok: false,
      reason: "provider_mismatch",
      diagnostics: {
        statePresent,
        cookiePresent,
        databaseRowFound: true,
        expired: existing.expiresAt.getTime() <= now.getTime(),
        consumed: Boolean(existing.consumedAt)
      }
    };
  }
  if (existing.consumedAt) {
    return {
      ok: false,
      reason: "state_already_consumed",
      diagnostics: {
        statePresent,
        cookiePresent,
        databaseRowFound: true,
        expired: existing.expiresAt.getTime() <= now.getTime(),
        consumed: true
      }
    };
  }
  if (existing.expiresAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: "state_expired",
      diagnostics: {
        statePresent,
        cookiePresent,
        databaseRowFound: true,
        expired: true,
        consumed: false
      }
    };
  }
  return {
    ok: false,
    reason: "database_consume_error",
    diagnostics: {
      statePresent,
      cookiePresent,
      databaseRowFound: true,
      expired: false,
      consumed: false
    }
  };
}

/**
 * Atomically consumes an authorization state.
 * Prefer `consumeOAuthStateDetailed` when callers need failure classification.
 */
export async function consumeOAuthState(options: {
  provider: ExternalIdentityProvider;
  stateFromProvider: string | null | undefined;
  stateFromCookie: string | null | undefined;
}): Promise<ConsumedOAuthState | null> {
  const result = await consumeOAuthStateDetailed(options);
  return result.ok ? result.state : null;
}

/** Sanitized structured log for OAuth state failures (no state/code/cookie/verifier). */
export function logOAuthStateFailure(input: {
  provider: ExternalIdentityProvider;
  mode?: OAuthFlowMode | null;
  callbackHost: string;
  result: Extract<OAuthStateConsumeResult, { ok: false }>;
}) {
  logger.warn("oauth.state_consume_failed", {
    provider: input.provider,
    mode: input.mode ?? null,
    callbackHost: input.callbackHost,
    reason: input.result.reason,
    statePresent: input.result.diagnostics.statePresent,
    cookiePresent: input.result.diagnostics.cookiePresent,
    databaseRowFound: input.result.diagnostics.databaseRowFound,
    expired: input.result.diagnostics.expired,
    consumed: input.result.diagnostics.consumed
  });
}

/** Best-effort cleanup for environments without TTL index support. */
export async function purgeExpiredOAuthStates(now = new Date()) {
  return oauthStates.deleteExpiredOAuthAuthorizationStates(getPostgresDb(), now);
}
