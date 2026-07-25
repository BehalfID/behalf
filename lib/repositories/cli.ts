/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/cli";
import { delegate } from "@/lib/repositories/delegate";

export type {
  CliPauseLeaseLean,
  CliAuditLogLean,
  FindAuditLogsInput,
} from "@/lib/repositories/mongo/cli";

export {
  auditLogModel,
  pauseLeaseModel,
  cliAuditLogRepository,
} from "@/lib/repositories/mongo/cli";

export const findActiveLeases = delegate("cli", "findActiveLeases", mongo.findActiveLeases);
export const createLease = delegate("cli", "createLease", mongo.createLease);
export const createAuditLog = delegate("cli", "createAuditLog", mongo.createAuditLog);
export const findAuditLogs = delegate("cli", "findAuditLogs", mongo.findAuditLogs);
