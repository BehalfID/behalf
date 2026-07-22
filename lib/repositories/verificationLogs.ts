/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/verificationLogs";
import { delegate } from "@/lib/repositories/delegate";

export type {
  VerificationLogLean,
  VerificationLogRepository,
} from "@/lib/repositories/mongo/verificationLogs";

export {
  verificationLogRepository,
  find,
  create,
  updateMany,
  deleteMany,
  countDocuments,
} from "@/lib/repositories/mongo/verificationLogs";

export const createLog = delegate("verificationLogs", "createLog", mongo.createLog);
export const findLogs = delegate("verificationLogs", "findLogs", mongo.findLogs);
export const findOneLog = delegate("verificationLogs", "findOneLog", mongo.findOneLog);
export const countLogs = delegate("verificationLogs", "countLogs", mongo.countLogs);
export const aggregateStats = delegate("verificationLogs", "aggregateStats", mongo.aggregateStats);
export const findAgentNames = delegate("verificationLogs", "findAgentNames", mongo.findAgentNames);
export const updateLogs = delegate("verificationLogs", "updateLogs", mongo.updateLogs);
export const deleteLogs = delegate("verificationLogs", "deleteLogs", mongo.deleteLogs);
export const findOneVerificationLog = delegate("verificationLogs", "findOneVerificationLog", mongo.findOneVerificationLog);
export const findVerificationLogs = delegate("verificationLogs", "findVerificationLogs", mongo.findVerificationLogs);
export const aggregateVerificationLogs = delegate("verificationLogs", "aggregateVerificationLogs", mongo.aggregateVerificationLogs);
