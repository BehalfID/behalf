/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/sessions";
import { delegate } from "@/lib/repositories/delegate";

export type {
  DeveloperSessionLean,
  CreateSessionInput,
  SessionsRepository,
} from "@/lib/repositories/mongo/sessions";

export {
  sessionRepository,
  findOne,
  create,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
} from "@/lib/repositories/mongo/sessions";

export const createSession = delegate("sessions", "createSession", mongo.createSession);
export const findByTokenHash = delegate("sessions", "findByTokenHash", mongo.findByTokenHash);
export const findBySessionId = delegate("sessions", "findBySessionId", mongo.findBySessionId);
export const updateActivity = delegate("sessions", "updateActivity", mongo.updateActivity);
export const deleteBySessionId = delegate("sessions", "deleteBySessionId", mongo.deleteBySessionId);
export const deleteByTokenHash = delegate("sessions", "deleteByTokenHash", mongo.deleteByTokenHash);
export const deleteByUserId = delegate("sessions", "deleteByUserId", mongo.deleteByUserId);
export const deleteManyByUserId = delegate("sessions", "deleteManyByUserId", mongo.deleteManyByUserId);
export const updateActiveAccountId = delegate("sessions", "updateActiveAccountId", mongo.updateActiveAccountId);
export const clearActiveAccountIdForUserAccount = delegate("sessions", "clearActiveAccountIdForUserAccount", mongo.clearActiveAccountIdForUserAccount);
export const deleteSession = delegate("sessions", "deleteSession", mongo.deleteSession);
export const deleteSessions = delegate("sessions", "deleteSessions", mongo.deleteSessions);
