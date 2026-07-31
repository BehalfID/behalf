import crypto from "crypto";
import type { NextRequest } from "next/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON
} from "@simplewebauthn/server";
import { recordSuccessfulLogin } from "@/lib/authProviders/authUsage";
import { recordIdentityAudit } from "@/lib/authProviders/identityAudit";
import {
  canAddPasskey,
  canRemoveLoginMethod
} from "@/lib/authProviders/loginMethodSafety";
import { getWebAuthnConfig } from "@/lib/authProviders/webauthnConfig";
import { getPostgresDb } from "@/lib/db/postgres";
import { createPublicId } from "@/lib/ids";
import { DuplicateKeyError } from "@/lib/repositories/errors";
import * as passkeys from "@/lib/repositories/postgres/passkeys";
import * as users from "@/lib/repositories/postgres/users";

/** Registration/authentication challenges expire quickly. */
export const WEBAUTHN_CHALLENGE_TTL_MS = 1000 * 60 * 5;

function hashChallenge(challenge: string): string {
  return crypto.createHash("sha256").update(challenge, "utf8").digest("hex");
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, "base64url")) as Uint8Array<ArrayBuffer>;
}

function userHandleFor(userId: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(userId) as Uint8Array<ArrayBuffer>;
}

async function storeChallenge(options: {
  kind: "registration" | "authentication";
  challenge: string;
  userId?: string | null;
}): Promise<string> {
  const challengeId = createPublicId("wach");
  await passkeys.createWebAuthnChallenge(getPostgresDb(), {
    challengeId,
    challengeHash: hashChallenge(options.challenge),
    kind: options.kind,
    userId: options.userId ?? null,
    expiresAt: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS)
  });
  return challengeId;
}

/**
 * Atomically consume a challenge. Returns null when missing, expired, wrong
 * kind, wrong user, or already used.
 */
async function consumeChallenge(options: {
  challenge: string;
  kind: "registration" | "authentication";
  userId?: string | null;
}): Promise<{ challengeId: string; userId: string | null } | null> {
  const updated = await passkeys.consumeWebAuthnChallenge(getPostgresDb(), {
    challengeHash: hashChallenge(options.challenge),
    kind: options.kind,
    userId: options.userId
  });

  if (!updated) return null;
  return { challengeId: updated.challengeId, userId: updated.userId ?? null };
}

export type PasskeySummary = {
  credentialRecordId: string;
  nickname: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  transports: string[];
  backedUp: boolean;
};

export async function listPasskeysForUser(userId: string): Promise<PasskeySummary[]> {
  const rows = await passkeys.listPasskeysByUserId(getPostgresDb(), userId);

  return rows.map((row) => ({
    credentialRecordId: row.credentialRecordId,
    nickname: row.nickname,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
    transports: row.transports ?? [],
    backedUp: Boolean(row.backedUp)
  }));
}

export async function beginPasskeyRegistration(options: {
  userId: string;
  email: string;
  displayName?: string;
}): Promise<
  | { ok: true; options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }
  | { ok: false; code: "webauthn_unconfigured" | "passkey_requires_recovery" }
> {
  const config = getWebAuthnConfig();
  if (!config) return { ok: false, code: "webauthn_unconfigured" };

  if (!(await canAddPasskey(options.userId))) {
    return { ok: false, code: "passkey_requires_recovery" };
  }

  const existing = await passkeys.listPasskeysByUserId(getPostgresDb(), options.userId);

  const registrationOptions = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID: userHandleFor(options.userId),
    userName: options.email,
    userDisplayName: options.displayName?.trim() || options.email,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      authenticatorAttachment: undefined
    },
    excludeCredentials: existing.map((cred) => ({
      id: cred.credentialId,
      transports: (cred.transports as AuthenticatorTransportFuture[] | null) ?? undefined
    })),
    supportedAlgorithmIDs: [-7, -257]
  });

  const challengeId = await storeChallenge({
    kind: "registration",
    challenge: registrationOptions.challenge,
    userId: options.userId
  });

  return { ok: true, options: registrationOptions, challengeId };
}

export type PublicKeyCredentialCreationOptionsJSON = Awaited<
  ReturnType<typeof generateRegistrationOptions>
>;
export type PublicKeyCredentialRequestOptionsJSON = Awaited<
  ReturnType<typeof generateAuthenticationOptions>
>;

export async function finishPasskeyRegistration(options: {
  userId: string;
  response: RegistrationResponseJSON;
  nickname?: string;
  request?: NextRequest;
}): Promise<
  | { ok: true; credentialRecordId: string; nickname: string }
  | {
      ok: false;
      code:
        | "webauthn_unconfigured"
        | "passkey_requires_recovery"
        | "invalid_challenge"
        | "verification_failed"
        | "duplicate_credential"
        | "invalid_nickname";
    }
> {
  const config = getWebAuthnConfig();
  if (!config) return { ok: false, code: "webauthn_unconfigured" };
  if (!(await canAddPasskey(options.userId))) {
    return { ok: false, code: "passkey_requires_recovery" };
  }

  const nickname = (options.nickname?.trim() || "Passkey").slice(0, 80);
  if (!nickname) return { ok: false, code: "invalid_nickname" };

  // The browser echoes the challenge inside clientDataJSON. We consume our
  // stored hash of that value before cryptographic verification so a replayed
  // response cannot pass a second time.
  let clientChallenge: string;
  try {
    const clientData = JSON.parse(
      Buffer.from(options.response.response.clientDataJSON, "base64url").toString("utf8")
    ) as { challenge?: string };
    if (!clientData.challenge || typeof clientData.challenge !== "string") {
      return { ok: false, code: "invalid_challenge" };
    }
    clientChallenge = clientData.challenge;
  } catch {
    return { ok: false, code: "invalid_challenge" };
  }

  const consumed = await consumeChallenge({
    challenge: clientChallenge,
    kind: "registration",
    userId: options.userId
  });
  if (!consumed) return { ok: false, code: "invalid_challenge" };

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: options.response,
      expectedChallenge: clientChallenge,
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpID,
      requireUserVerification: true
    });
  } catch {
    return { ok: false, code: "verification_failed" };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, code: "verification_failed" };
  }

  const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
    verification.registrationInfo;

  const credentialId = credential.id;
  const publicKey = toBase64Url(credential.publicKey);
  const credentialRecordId = createPublicId("pkcred");
  const db = getPostgresDb();

  try {
    await passkeys.createPasskeyCredential(db, {
      credentialRecordId,
      userId: options.userId,
      credentialId,
      publicKey,
      signCount: credential.counter,
      transports: credential.transports ?? options.response.response.transports ?? [],
      nickname,
      userHandle: toBase64Url(userHandleFor(options.userId)),
      deviceType: credentialDeviceType ?? null,
      backedUp: Boolean(credentialBackedUp),
      aaguid: aaguid ?? null
    });
  } catch (error) {
    if (error instanceof DuplicateKeyError) {
      return { ok: false, code: "duplicate_credential" };
    }
    throw error;
  }

  const user = await users.findByUserId(db, options.userId);
  const providers = new Set(user?.authProviders ?? []);
  providers.add("passkey");
  await users.updateUser(db, options.userId, { authProviders: Array.from(providers) });

  await recordIdentityAudit({
    userId: options.userId,
    action: "passkey_registered",
    provider: "passkey",
    providerAccountId: credentialRecordId,
    providerUsername: nickname,
    request: options.request,
    context: "settings"
  });

  return { ok: true, credentialRecordId, nickname };
}

export async function beginPasskeyAuthentication(options?: {
  userId?: string;
}): Promise<
  | { ok: true; options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }
  | { ok: false; code: "webauthn_unconfigured" }
> {
  const config = getWebAuthnConfig();
  if (!config) return { ok: false, code: "webauthn_unconfigured" };

  let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] | undefined;
  if (options?.userId) {
    const existing = await passkeys.listPasskeysByUserId(getPostgresDb(), options.userId);
    allowCredentials = existing.map((cred) => ({
      id: cred.credentialId,
      transports: (cred.transports as AuthenticatorTransportFuture[] | null) ?? undefined
    }));
  }

  const authenticationOptions = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: "required",
    allowCredentials
  });

  const challengeId = await storeChallenge({
    kind: "authentication",
    challenge: authenticationOptions.challenge,
    userId: options?.userId ?? null
  });

  return { ok: true, options: authenticationOptions, challengeId };
}

export async function finishPasskeyAuthentication(options: {
  response: AuthenticationResponseJSON;
  request?: NextRequest;
}): Promise<
  | { ok: true; userId: string; credentialRecordId: string }
  | {
      ok: false;
      code:
        | "webauthn_unconfigured"
        | "invalid_challenge"
        | "unknown_credential"
        | "verification_failed"
        | "counter_anomaly";
    }
> {
  const config = getWebAuthnConfig();
  if (!config) return { ok: false, code: "webauthn_unconfigured" };

  let clientChallenge: string;
  try {
    const clientData = JSON.parse(
      Buffer.from(options.response.response.clientDataJSON, "base64url").toString("utf8")
    ) as { challenge?: string };
    if (!clientData.challenge || typeof clientData.challenge !== "string") {
      return { ok: false, code: "invalid_challenge" };
    }
    clientChallenge = clientData.challenge;
  } catch {
    return { ok: false, code: "invalid_challenge" };
  }

  const consumed = await consumeChallenge({
    challenge: clientChallenge,
    kind: "authentication"
  });
  if (!consumed) return { ok: false, code: "invalid_challenge" };

  const credentialId = options.response.id;
  const db = getPostgresDb();
  const stored = await passkeys.findPasskeyByCredentialId(db, credentialId);
  if (!stored) return { ok: false, code: "unknown_credential" };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: options.response,
      expectedChallenge: clientChallenge,
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: fromBase64Url(stored.publicKey),
        counter: stored.signCount,
        transports: (stored.transports as AuthenticatorTransportFuture[] | null) ?? undefined
      }
    });
  } catch {
    return { ok: false, code: "verification_failed" };
  }

  if (!verification.verified || !verification.authenticationInfo) {
    return { ok: false, code: "verification_failed" };
  }

  const { newCounter } = verification.authenticationInfo;
  // Counter rollback indicates a possible cloned authenticator.
  if (stored.signCount > 0 && newCounter > 0 && newCounter <= stored.signCount) {
    await recordIdentityAudit({
      userId: stored.userId,
      action: "method_removal_rejected",
      provider: "passkey",
      providerAccountId: stored.credentialRecordId,
      providerUsername: stored.nickname,
      request: options.request,
      context: "counter_anomaly"
    });
    return { ok: false, code: "counter_anomaly" };
  }

  await passkeys.updatePasskeyByRecordId(db, stored.credentialRecordId, {
    signCount: newCounter,
    lastUsedAt: new Date()
  });

  await recordSuccessfulLogin({
    userId: stored.userId,
    method: "passkey",
    request: options.request,
    credentialId: stored.credentialRecordId,
    providerUsername: stored.nickname,
    context: "passkey_login"
  });

  return {
    ok: true,
    userId: stored.userId,
    credentialRecordId: stored.credentialRecordId
  };
}

export async function renamePasskey(options: {
  userId: string;
  credentialRecordId: string;
  nickname: string;
  request?: NextRequest;
}): Promise<{ ok: true } | { ok: false; code: "not_found" | "invalid_nickname" }> {
  const nickname = options.nickname.trim().slice(0, 80);
  if (!nickname) return { ok: false, code: "invalid_nickname" };

  const updated = await passkeys.updatePasskeyCredential(
    getPostgresDb(),
    options.userId,
    options.credentialRecordId,
    { nickname }
  );

  if (!updated) return { ok: false, code: "not_found" };

  await recordIdentityAudit({
    userId: options.userId,
    action: "passkey_renamed",
    provider: "passkey",
    providerAccountId: options.credentialRecordId,
    providerUsername: nickname,
    request: options.request,
    context: "settings"
  });

  return { ok: true };
}

export async function removePasskey(options: {
  userId: string;
  credentialRecordId: string;
  request?: NextRequest;
}): Promise<
  | { ok: true }
  | { ok: false; code: "not_found" | "unlink_last_method" | "passkey_only_forbidden" }
> {
  const allowed = await canRemoveLoginMethod(options.userId, {
    kind: "passkey",
    passkeyCredentialRecordId: options.credentialRecordId
  });
  if (!allowed.allowed) {
    await recordIdentityAudit({
      userId: options.userId,
      action: "method_removal_rejected",
      provider: "passkey",
      providerAccountId: options.credentialRecordId,
      request: options.request,
      context: allowed.reason ?? "settings"
    });
    return {
      ok: false,
      code: allowed.reason === "not_found" ? "not_found" : allowed.reason ?? "unlink_last_method"
    };
  }

  const db = getPostgresDb();
  const deleted = await passkeys.deletePasskeyCredential(
    db,
    options.userId,
    options.credentialRecordId
  );

  if (!deleted) return { ok: false, code: "not_found" };

  const remaining = await passkeys.countPasskeysByUserId(db, options.userId);
  if (remaining === 0) {
    const user = await users.findByUserId(db, options.userId);
    const providers = (user?.authProviders ?? []).filter((p) => p !== "passkey");
    await users.updateUser(db, options.userId, { authProviders: providers });
  }

  await recordIdentityAudit({
    userId: options.userId,
    action: "passkey_removed",
    provider: "passkey",
    providerAccountId: options.credentialRecordId,
    providerUsername: deleted.nickname,
    request: options.request,
    context: "settings"
  });

  return { ok: true };
}
