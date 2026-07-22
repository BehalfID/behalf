import DeveloperApiToken from "@/models/DeveloperApiToken";
import { translateDuplicateKey } from "@/lib/repositories/errors";
import { lazyModelMethod } from "@/lib/repositories/mongoModelAdapter";
export type DeveloperApiTokenLean = {
  _id?: unknown;
  tokenId: string;
  userId: string;
  accountId: string;
  name: string;
  tokenPreview?: string;
  tokenHash?: string;
  lastUsedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CreateApiTokenInput = Pick<
  DeveloperApiTokenLean,
  "tokenId" | "userId" | "accountId" | "name" | "tokenPreview" | "tokenHash"
>;

export async function findByTokenHash(tokenHash: string): Promise<DeveloperApiTokenLean | null> {
  return (await DeveloperApiToken.findOne({ tokenHash }).select("+tokenHash").lean()) as DeveloperApiTokenLean | null;
}

export async function createApiToken(input: CreateApiTokenInput): Promise<DeveloperApiTokenLean> {
  try {
    const token = await DeveloperApiToken.create(input);
    return token.toObject() as DeveloperApiTokenLean;
  } catch (error) {
    translateDuplicateKey(error, "A developer token with this ID already exists.");
  }
}

export async function listByUserId(
  userId: string,
  options?: { accountId?: string; select?: string }
): Promise<DeveloperApiTokenLean[]> {
  const filter: Record<string, unknown> = { userId };
  if (options?.accountId) filter.accountId = options.accountId;
  return (await DeveloperApiToken.find(filter)
    .select(options?.select ?? "-_id tokenId name accountId tokenPreview lastUsedAt createdAt")
    .lean()) as DeveloperApiTokenLean[];
}

export function countByUserId(userId: string, accountId?: string) {
  return DeveloperApiToken.countDocuments({ userId, ...(accountId ? { accountId } : {}) });
}

export function deleteByTokenId(tokenId: string, userId?: string) {
  return DeveloperApiToken.deleteOne({ tokenId, ...(userId ? { userId } : {}) });
}

export function deleteManyByUserId(userId: string) {
  return DeveloperApiToken.deleteMany({ userId });
}

export function deleteManyByUserOrAccount(userId: string, accountId: string) {
  return DeveloperApiToken.deleteMany({ $or: [{ userId }, { accountId }] });
}

export function touchLastUsed(tokenId: string, at = new Date()) {
  return DeveloperApiToken.updateOne({ tokenId }, { $set: { lastUsedAt: at } });
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function findApiTokens(filter: Record<string, unknown> = {}) {
  return DeveloperApiToken.find(filter);
}

export function createApiTokenDocument(input: Record<string, unknown>) {
  return DeveloperApiToken.create(input);
}

export function countApiTokens(filter: Record<string, unknown> = {}) {
  return DeveloperApiToken.countDocuments(filter);
}

export function deleteApiToken(filter: Record<string, unknown>) {
  return DeveloperApiToken.deleteOne(filter);
}

export const apiTokenRepository = {
  create: createApiTokenDocument,
  find: findApiTokens,
  countDocuments: countApiTokens,
  deleteOne: deleteApiToken
};

export interface ApiTokensRepository {
  findByTokenHash: typeof findByTokenHash;
  createApiToken: typeof createApiToken;
  listByUserId: typeof listByUserId;
  countByUserId: typeof countByUserId;
  deleteByTokenId: typeof deleteByTokenId;
  deleteManyByUserId: typeof deleteManyByUserId;
  deleteManyByUserOrAccount: typeof deleteManyByUserOrAccount;
  touchLastUsed: typeof touchLastUsed;
}

export const findOne = lazyModelMethod(() => DeveloperApiToken, "findOne");
export const create = lazyModelMethod(() => DeveloperApiToken, "create");
export const updateOne = lazyModelMethod(() => DeveloperApiToken, "updateOne");
export const deleteMany = lazyModelMethod(() => DeveloperApiToken, "deleteMany");