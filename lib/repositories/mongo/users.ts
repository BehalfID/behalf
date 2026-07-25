import DeveloperUser, { type AuthProvider } from "@/models/DeveloperUser";
import { translateDuplicateKey } from "@/lib/repositories/errors";
import { lazyModelMethod } from "@/lib/repositories/mongoModelAdapter";

export type DeveloperUserLean = {
  _id?: unknown;
  userId: string;
  email: string;
  passwordHash?: string;
  googleSub?: string;
  authProviders?: AuthProvider[];
  onboardingUseCase?: "personal" | "website" | "sdk";
  primaryAccountId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  onboardingCompletedAt?: Date | null;
  dateOfBirth?: string;
  emailVerified?: boolean | null;
  emailVerificationTokenHash?: string;
  emailVerificationTokenExpiresAt?: Date;
  emailVerificationCodeHash?: string;
  passwordResetTokenHash?: string;
  passwordResetTokenExpiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CreateUserInput = Omit<DeveloperUserLean, "_id" | "createdAt" | "updatedAt">;
export type UserSet = Record<string, unknown>;
export type UserLookupOptions = { select?: string };

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

async function queryOneLean(filter: Record<string, unknown>, options?: UserLookupOptions) {
  const query = DeveloperUser.findOne(filter);
  if (options?.select) query.select(options.select);
  return (await query.lean()) as DeveloperUserLean | null;
}

export function findByEmail(email: string, options?: UserLookupOptions) {
  return queryOneLean({ email: normalizedEmail(email) }, options);
}

export function findByEmailWithPassword(email: string) {
  return findByEmail(email, { select: "+passwordHash authProviders" });
}

export function findByUserId(userId: string, options?: UserLookupOptions) {
  return queryOneLean({ userId }, options);
}

export function findByGoogleSub(googleSub: string, options?: UserLookupOptions) {
  return queryOneLean({ googleSub }, options);
}

export function findByPasswordResetTokenHash(tokenHash: string) {
  return queryOneLean(
    { passwordResetTokenHash: tokenHash, passwordResetTokenExpiresAt: { $gt: new Date() } },
    { select: "+passwordResetTokenHash +passwordResetTokenExpiresAt email userId" }
  );
}

export function findByVerificationTokenHash(tokenHash: string) {
  return queryOneLean(
    { emailVerificationTokenHash: tokenHash, emailVerificationTokenExpiresAt: { $gt: new Date() } },
    { select: "+emailVerificationTokenHash +emailVerificationTokenExpiresAt" }
  );
}

export function findByVerificationCodeHash(codeHash: string) {
  return queryOneLean(
    { emailVerificationCodeHash: codeHash, emailVerificationTokenExpiresAt: { $gt: new Date() } },
    { select: "+emailVerificationCodeHash +emailVerificationTokenExpiresAt" }
  );
}

export async function findByUserIds(userIds: string[], select = "userId email") {
  if (userIds.length === 0) return [] as DeveloperUserLean[];
  return (await DeveloperUser.find({ userId: { $in: userIds } }).select(select).lean()) as DeveloperUserLean[];
}

export async function existsByEmail(email: string): Promise<boolean> {
  return Boolean(await DeveloperUser.exists({ email: normalizedEmail(email) }));
}

export async function existsByEmailOrGoogleSub(email: string, googleSub: string): Promise<boolean> {
  return Boolean(await DeveloperUser.exists({ $or: [{ email: normalizedEmail(email) }, { googleSub }] }));
}

export async function createUser(input: CreateUserInput): Promise<DeveloperUserLean> {
  try {
    const user = await DeveloperUser.create({ ...input, email: normalizedEmail(input.email) });
    return user.toObject() as DeveloperUserLean;
  } catch (error) {
    translateDuplicateKey(error, "A user with this email already exists.");
  }
}

/** Apply a generic $set update to a user identified by its public ID. */
export function updateUser(userId: string, set: UserSet) {
  return DeveloperUser.updateOne({ userId }, { $set: set });
}

export function updateUserAtomic(
  userId: string,
  update: { $set?: UserSet; $unset?: Record<string, unknown>; $inc?: Record<string, number> }
) {
  return DeveloperUser.updateOne({ userId }, update);
}

export async function findUnverifiedExpired(cutoff: Date): Promise<Array<Pick<DeveloperUserLean, "userId">>> {
  return (await DeveloperUser.find({ emailVerified: false, createdAt: { $lte: cutoff } })
    .select("userId")
    .lean()) as Array<Pick<DeveloperUserLean, "userId">>;
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function createUserDocument(input: Record<string, unknown>) {
  return DeveloperUser.create(input);
}

export function findUsers(filter: Record<string, unknown> = {}) {
  return DeveloperUser.find(filter);
}

export function findOneUser(filter: Record<string, unknown>) {
  return DeveloperUser.findOne(filter);
}

export function updateUserByFilter(filter: Record<string, unknown>, update: Record<string, unknown>) {
  return DeveloperUser.updateOne(filter, update);
}

export function countUserDocuments(filter: Record<string, unknown> = {}) {
  return DeveloperUser.countDocuments(filter);
}

export function userExists(filter: Record<string, unknown>) {
  return DeveloperUser.exists(filter);
}

export const userRepository = {
  create: createUserDocument,
  find: findUsers,
  findOne: findOneUser,
  updateOne: updateUserByFilter,
  countDocuments: countUserDocuments,
  exists: userExists
};

export interface UsersRepository {
  findByEmail: typeof findByEmail;
  findByEmailWithPassword: typeof findByEmailWithPassword;
  findByUserId: typeof findByUserId;
  findByGoogleSub: typeof findByGoogleSub;
  findByPasswordResetTokenHash: typeof findByPasswordResetTokenHash;
  findByVerificationTokenHash: typeof findByVerificationTokenHash;
  findByVerificationCodeHash: typeof findByVerificationCodeHash;
  findByUserIds: typeof findByUserIds;
  existsByEmail: typeof existsByEmail;
  existsByEmailOrGoogleSub: typeof existsByEmailOrGoogleSub;
  createUser: typeof createUser;
  updateUser: typeof updateUser;
  updateUserAtomic: typeof updateUserAtomic;
  findUnverifiedExpired: typeof findUnverifiedExpired;
}

export function deleteUser(userId: string) {
  return DeveloperUser.deleteOne({ userId });
}

/** Legacy query-shaped adapters for callers being migrated from models. */
export const findOne = lazyModelMethod(() => DeveloperUser, "findOne");
export const find = lazyModelMethod(() => DeveloperUser, "find");
export const create = lazyModelMethod(() => DeveloperUser, "create");
export const updateOne = lazyModelMethod(() => DeveloperUser, "updateOne");
export const updateMany = lazyModelMethod(() => DeveloperUser, "updateMany");
export const deleteOne = lazyModelMethod(() => DeveloperUser, "deleteOne");
