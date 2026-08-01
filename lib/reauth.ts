/**
 * Purpose-bound recent authentication for sensitive actions.
 *
 * A stolen session alone is never enough: the user must freshly prove a usable
 * login method. The opaque proof token is hashed at rest and consumed once.
 */

import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import { getUsableLoginMethods } from "@/lib/authProviders/loginMethodSafety";
import { isGitHubOAuthConfigured } from "@/lib/authProviders/providers/github";
import { isWebAuthnConfigured } from "@/lib/authProviders/webauthnConfig";
import { getPostgresDb } from "@/lib/db/postgres";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";
import { createPublicId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import * as reauthProofs from "@/lib/repositories/postgres/reauthProofs";
import type { ReauthMethod, ReauthPurpose } from "@/lib/repositories/postgres/reauthProofs";
import { resolveSessionCookieDomain } from "@/lib/subdomainRouting";
import * as externalIdentities from "@/lib/repositories/externalIdentities";
import * as users from "@/lib/repositories/users";

export const REAUTH_PROOF_TTL_MS = 1000 * 60 * 8;
export const ACCOUNT_DELETE_PURPOSE: ReauthPurpose = "account_delete";
export const REAUTH_PROOF_COOKIE = "behalfid_reauth_proof";

export type UsableReauthMethod = {
  method: ReauthMethod;
  label: string;
  available: boolean;
};

function hashProofToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function reauthCookieOptions(maxAgeSeconds: number) {
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

export function setReauthProofCookie(response: NextResponse, token: string) {
  response.cookies.set(
    REAUTH_PROOF_COOKIE,
    token,
    reauthCookieOptions(Math.floor(REAUTH_PROOF_TTL_MS / 1000))
  );
}

export function clearReauthProofCookie(response: NextResponse) {
  response.cookies.set(REAUTH_PROOF_COOKIE, "", { ...reauthCookieOptions(0), maxAge: 0 });
}

/** Which reauth methods the user can use for account deletion. */
export async function listAccountDeleteReauthMethods(
  userId: string
): Promise<{ methods: UsableReauthMethod[]; blockedReason: string | null }> {
  const [user, snapshot, identities] = await Promise.all([
    users.findByUserId(userId),
    getUsableLoginMethods(userId),
    externalIdentities.listByUserId(userId)
  ]);

  const methods: UsableReauthMethod[] = [];
  if (snapshot.hasPassword) {
    methods.push({ method: "password", label: "Password", available: true });
  }
  const hasGithub = identities.some((i) => i.provider === "github");
  if (hasGithub) {
    methods.push({
      method: "github",
      label: "GitHub",
      available: isGitHubOAuthConfigured()
    });
  }
  const hasGoogle =
    Boolean(user?.googleSub) || identities.some((i) => i.provider === "google");
  if (hasGoogle) {
    methods.push({
      method: "google",
      label: "Google",
      available: isGoogleOAuthConfigured()
    });
  }
  if (snapshot.passkeyCount > 0) {
    methods.push({
      method: "passkey",
      label: "Passkey",
      available: isWebAuthnConfigured()
    });
  }

  const usable = methods.filter((m) => m.available);
  if (usable.length === 0) {
    logger.warn("account_deletion_blocked", {
      userId,
      reason: "no_usable_reauth_method",
      hasPassword: snapshot.hasPassword,
      passkeyCount: snapshot.passkeyCount,
      oauthProviderCount: snapshot.oauthProviderCount,
      hasGoogleSub: Boolean(user?.googleSub)
    });
    return {
      methods,
      blockedReason:
        "No usable sign-in method is available to confirm deletion. Contact support to recover access."
    };
  }
  return { methods, blockedReason: null };
}

export async function issueReauthProof(options: {
  userId: string;
  purpose: ReauthPurpose;
  method: ReauthMethod;
  sessionId?: string | null;
  request?: NextRequest;
}): Promise<{ token: string; expiresAt: Date; proofId: string }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const proofId = createPublicId("reauth");
  const expiresAt = new Date(Date.now() + REAUTH_PROOF_TTL_MS);

  await reauthProofs.createReauthProof(getPostgresDb(), {
    proofId,
    userId: options.userId,
    purpose: options.purpose,
    method: options.method,
    proofHash: hashProofToken(token),
    sessionId: options.sessionId ?? null,
    expiresAt
  });

  await recordIdentityAudit({
    userId: options.userId,
    action: "account_deletion_reauth_succeeded",
    provider: options.method === "password" ? "password" : options.method === "passkey" ? "passkey" : options.method,
    providerAccountId: proofId,
    request: options.request,
    context: `reauth:${options.purpose}:${options.method}`
  });

  logger.info("account_deletion_reauth_succeeded", {
    userId: options.userId,
    method: options.method,
    purpose: options.purpose,
    proofId
  });

  return { token, expiresAt, proofId };
}

export type ConsumeReauthFailure =
  | "missing_proof"
  | "wrong_user"
  | "wrong_purpose"
  | "expired"
  | "already_consumed"
  | "not_found";

/**
 * Atomically consume a proof for account_delete. Returns the method used on success.
 */
export async function consumeAccountDeleteReauthProof(options: {
  token: string | null | undefined;
  userId: string;
}): Promise<
  | { ok: true; method: ReauthMethod; proofId: string }
  | { ok: false; reason: ConsumeReauthFailure }
> {
  const token = options.token?.trim();
  if (!token) return { ok: false, reason: "missing_proof" };

  const proofHash = hashProofToken(token);
  const consumed = await reauthProofs.consumeReauthProof(getPostgresDb(), {
    proofHash,
    userId: options.userId,
    purpose: ACCOUNT_DELETE_PURPOSE
  });

  if (consumed) {
    return { ok: true, method: consumed.method, proofId: consumed.proofId };
  }

  const existing = await reauthProofs.findReauthProofByHash(getPostgresDb(), proofHash);
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.userId !== options.userId) return { ok: false, reason: "wrong_user" };
  if (existing.purpose !== ACCOUNT_DELETE_PURPOSE) return { ok: false, reason: "wrong_purpose" };
  if (existing.consumedAt) return { ok: false, reason: "already_consumed" };
  if (existing.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  return { ok: false, reason: "not_found" };
}

export async function logAccountDeletionReauthFailed(options: {
  userId: string;
  method: ReauthMethod | "unknown";
  reason: string;
  request?: NextRequest;
}) {
  logger.warn("account_deletion_reauth_failed", {
    userId: options.userId,
    method: options.method,
    reason: options.reason
  });
  try {
    await recordIdentityAudit({
      userId: options.userId,
      action: "account_deletion_reauth_failed",
      provider:
        options.method === "password" || options.method === "passkey" || options.method === "github" || options.method === "google"
          ? options.method
          : "password",
      providerAccountId: "reauth_failed",
      request: options.request,
      context: options.reason.slice(0, 120)
    });
  } catch {
    /* best-effort */
  }
}

export function readReauthTokenFromRequest(
  request: NextRequest,
  bodyToken?: unknown
): string | null {
  if (typeof bodyToken === "string" && bodyToken.trim()) return bodyToken.trim();
  return request.cookies.get(REAUTH_PROOF_COOKIE)?.value ?? null;
}
