/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/apiTokens";
import { delegate } from "@/lib/repositories/delegate";

export type {
  DeveloperApiTokenLean,
  CreateApiTokenInput,
  ApiTokensRepository,
} from "@/lib/repositories/mongo/apiTokens";

export {
  apiTokenRepository,
  findOne,
  create,
  updateOne,
  deleteMany,
} from "@/lib/repositories/mongo/apiTokens";

export const findByTokenHash = delegate("apiTokens", "findByTokenHash", mongo.findByTokenHash);
export const createApiToken = delegate("apiTokens", "createApiToken", mongo.createApiToken);
export const listByUserId = delegate("apiTokens", "listByUserId", mongo.listByUserId);
export const countByUserId = delegate("apiTokens", "countByUserId", mongo.countByUserId);
export const deleteByTokenId = delegate("apiTokens", "deleteByTokenId", mongo.deleteByTokenId);
export const deleteManyByUserId = delegate("apiTokens", "deleteManyByUserId", mongo.deleteManyByUserId);
export const deleteManyByUserOrAccount = delegate("apiTokens", "deleteManyByUserOrAccount", mongo.deleteManyByUserOrAccount);
export const touchLastUsed = delegate("apiTokens", "touchLastUsed", mongo.touchLastUsed);
export const findApiTokens = delegate("apiTokens", "findApiTokens", mongo.findApiTokens);
export const createApiTokenDocument = delegate("apiTokens", "createApiTokenDocument", mongo.createApiTokenDocument);
export const countApiTokens = delegate("apiTokens", "countApiTokens", mongo.countApiTokens);
export const deleteApiToken = delegate("apiTokens", "deleteApiToken", mongo.deleteApiToken);
