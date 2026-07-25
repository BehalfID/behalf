/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/oauthPending";
import { delegate } from "@/lib/repositories/delegate";

export type {
  OAuthPendingSignupLean,
  CreateOAuthPendingSignupInput,
  OAuthPendingRepository,
} from "@/lib/repositories/mongo/oauthPending";

export {
  oauthPendingRepository,
} from "@/lib/repositories/mongo/oauthPending";

export const createPendingSignup = delegate("oauthPending", "createPendingSignup", mongo.createPendingSignup);
export const findByPendingId = delegate("oauthPending", "findByPendingId", mongo.findByPendingId);
export const findByTokenHash = delegate("oauthPending", "findByTokenHash", mongo.findByTokenHash);
export const findByGoogleSub = delegate("oauthPending", "findByGoogleSub", mongo.findByGoogleSub);
export const deleteByPendingId = delegate("oauthPending", "deleteByPendingId", mongo.deleteByPendingId);
export const deleteExpired = delegate("oauthPending", "deleteExpired", mongo.deleteExpired);
export const findOnePendingSignup = delegate("oauthPending", "findOnePendingSignup", mongo.findOnePendingSignup);
export const createPendingSignupDocument = delegate("oauthPending", "createPendingSignupDocument", mongo.createPendingSignupDocument);
export const deletePendingSignup = delegate("oauthPending", "deletePendingSignup", mongo.deletePendingSignup);
