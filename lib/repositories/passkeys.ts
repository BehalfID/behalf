/** Public facade for passkeys / WebAuthn challenges — Postgres cutover (no Mongo twin). */
import { getPostgresDb } from "@/lib/db/postgres";
import * as pg from "@/lib/repositories/postgres/passkeys";

export type {
  PasskeyCredentialLean,
  CreatePasskeyCredentialInput,
  WebAuthnChallengeKind,
  WebAuthnChallengeLean,
  CreateWebAuthnChallengeInput
} from "@/lib/repositories/postgres/passkeys";

export async function listPasskeysByUserId(userId: string) {
  return pg.listPasskeysByUserId(getPostgresDb(), userId);
}

export async function findPasskeyByCredentialId(credentialId: string) {
  return pg.findPasskeyByCredentialId(getPostgresDb(), credentialId);
}

export async function findPasskeyByRecordId(userId: string, credentialRecordId: string) {
  return pg.findPasskeyByRecordId(getPostgresDb(), userId, credentialRecordId);
}

export async function countPasskeysByUserId(userId: string) {
  return pg.countPasskeysByUserId(getPostgresDb(), userId);
}

export async function passkeyExists(userId: string, credentialRecordId: string) {
  return pg.passkeyExists(getPostgresDb(), userId, credentialRecordId);
}

export async function createPasskeyCredential(input: pg.CreatePasskeyCredentialInput) {
  return pg.createPasskeyCredential(getPostgresDb(), input);
}

export async function updatePasskeyCredential(
  userId: string,
  credentialRecordId: string,
  set: Partial<{ nickname: string; signCount: number; lastUsedAt: Date }>
) {
  return pg.updatePasskeyCredential(getPostgresDb(), userId, credentialRecordId, set);
}

export async function updatePasskeyByRecordId(
  credentialRecordId: string,
  set: Partial<{ nickname: string; signCount: number; lastUsedAt: Date }>
) {
  return pg.updatePasskeyByRecordId(getPostgresDb(), credentialRecordId, set);
}

export async function deletePasskeyCredential(userId: string, credentialRecordId: string) {
  return pg.deletePasskeyCredential(getPostgresDb(), userId, credentialRecordId);
}

export async function createWebAuthnChallenge(input: pg.CreateWebAuthnChallengeInput) {
  return pg.createWebAuthnChallenge(getPostgresDb(), input);
}

export async function consumeWebAuthnChallenge(options: {
  challengeHash: string;
  kind: pg.WebAuthnChallengeKind;
  userId?: string | null;
  now?: Date;
}) {
  return pg.consumeWebAuthnChallenge(getPostgresDb(), options);
}

export async function deleteExpiredWebAuthnChallenges(before?: Date) {
  return pg.deleteExpiredWebAuthnChallenges(getPostgresDb(), before);
}
