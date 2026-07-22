import OAuthPendingSignup from "@/models/OAuthPendingSignup";
import { translateDuplicateKey } from "@/lib/repositories/errors";

export type OAuthPendingSignupLean = {
  _id?: unknown;
  pendingId: string;
  googleSub: string;
  email: string;
  emailVerified: boolean;
  firstName?: string | null;
  lastName?: string | null;
  tokenHash?: string;
  expiresAt: Date;
  createdAt?: Date;
};

export type CreateOAuthPendingSignupInput = Omit<OAuthPendingSignupLean, "_id" | "createdAt">;

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function createPendingSignup(
  input: CreateOAuthPendingSignupInput
): Promise<OAuthPendingSignupLean> {
  try {
    const pending = await OAuthPendingSignup.create({ ...input, email: normalizedEmail(input.email) });
    return pending.toObject() as OAuthPendingSignupLean;
  } catch (error) {
    translateDuplicateKey(error, "A pending Google sign-up already exists.");
  }
}

export async function findByPendingId(
  pendingId: string,
  options?: { includeTokenHash?: boolean }
): Promise<OAuthPendingSignupLean | null> {
  const query = OAuthPendingSignup.findOne({ pendingId });
  if (options?.includeTokenHash) {
    query.select("+tokenHash pendingId googleSub email emailVerified firstName lastName expiresAt");
  }
  return (await query.lean()) as OAuthPendingSignupLean | null;
}

export async function findByTokenHash(tokenHash: string): Promise<OAuthPendingSignupLean | null> {
  return (await OAuthPendingSignup.findOne({ tokenHash }).select("+tokenHash").lean()) as OAuthPendingSignupLean | null;
}

export async function findByGoogleSub(googleSub: string): Promise<OAuthPendingSignupLean | null> {
  return (await OAuthPendingSignup.findOne({ googleSub }).lean()) as OAuthPendingSignupLean | null;
}

export function deleteByPendingId(pendingId: string) {
  return OAuthPendingSignup.deleteOne({ pendingId });
}

export function deleteExpired(before = new Date()) {
  return OAuthPendingSignup.deleteMany({ expiresAt: { $lte: before } });
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function findOnePendingSignup(filter: Record<string, unknown>) {
  return OAuthPendingSignup.findOne(filter);
}

export function createPendingSignupDocument(input: Record<string, unknown>) {
  return OAuthPendingSignup.create(input);
}

export function deletePendingSignup(filter: Record<string, unknown>) {
  return OAuthPendingSignup.deleteOne(filter);
}

export const oauthPendingRepository = {
  create: createPendingSignupDocument,
  findOne: findOnePendingSignup,
  deleteOne: deletePendingSignup
};

export interface OAuthPendingRepository {
  createPendingSignup: typeof createPendingSignup;
  findByPendingId: typeof findByPendingId;
  findByTokenHash: typeof findByTokenHash;
  findByGoogleSub: typeof findByGoogleSub;
  deleteByPendingId: typeof deleteByPendingId;
  deleteExpired: typeof deleteExpired;
}
