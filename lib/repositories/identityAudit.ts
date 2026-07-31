/** Public facade for identity audit logs — Postgres cutover (no Mongo twin). */
import { getPostgresDb } from "@/lib/db/postgres";
import * as pg from "@/lib/repositories/postgres/identityAudit";

export type {
  IdentityAuditAction,
  IdentityAuditProvider,
  IdentityAuditLogLean,
  CreateIdentityAuditInput
} from "@/lib/repositories/postgres/identityAudit";

export async function createIdentityAuditLog(input: pg.CreateIdentityAuditInput) {
  return pg.createIdentityAuditLog(getPostgresDb(), input);
}

export async function listIdentityAuditLogs(userId: string, limit?: number) {
  return pg.listIdentityAuditLogs(getPostgresDb(), userId, limit);
}
