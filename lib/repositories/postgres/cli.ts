import { and, desc, eq, gt, inArray, lt, lte, gte, or, type SQL } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { cliAuditActivities, cliPauseLeases } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type { FindAuditLogsInput } from "@/lib/repositories/cli";

type LeaseRow = typeof cliPauseLeases.$inferSelect;
type LeaseInsert = typeof cliPauseLeases.$inferInsert;
type AuditRow = typeof cliAuditActivities.$inferSelect;
type AuditInsert = typeof cliAuditActivities.$inferInsert;

export type CliPauseLeaseDomain = LeaseRow;
export type CliAuditActivityDomain = AuditRow;

export async function findActiveLeases(
  db: BehalfPostgresDb,
  filter: {
    accountId?: string;
    userId?: string;
    deviceId?: string;
    now?: Date;
  }
): Promise<CliPauseLeaseDomain[]> {
  const { now = new Date(), ...identity } = filter;
  const conditions: SQL[] = [
    eq(cliPauseLeases.granted, true),
    gt(cliPauseLeases.expiresAt, now)
  ];
  if (identity.accountId) conditions.push(eq(cliPauseLeases.accountId, identity.accountId));
  if (identity.userId) conditions.push(eq(cliPauseLeases.userId, identity.userId));
  if (identity.deviceId) conditions.push(eq(cliPauseLeases.deviceId, identity.deviceId));

  return db.query.cliPauseLeases.findMany({
    where: and(...conditions),
    orderBy: desc(cliPauseLeases.expiresAt),
    limit: 20
  });
}

export async function createLease(
  db: BehalfPostgresDb,
  input: Omit<LeaseInsert, "createdAt" | "updatedAt">
) {
  try {
    const [row] = await db.insert(cliPauseLeases).values(input).returning();
    if (!row) throw new Error("createLease failed to return a row");
    return row;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function createAuditLog(
  db: BehalfPostgresDb,
  input: Omit<AuditInsert, "createdAt" | "updatedAt">
) {
  try {
    const [row] = await db.insert(cliAuditActivities).values(input).returning();
    if (!row) throw new Error("createAuditLog failed to return a row");
    return row;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findAuditLogs(
  db: BehalfPostgresDb,
  input: FindAuditLogsInput
): Promise<CliAuditActivityDomain[]> {
  const conditions: SQL[] = [];

  if (input.accountId) conditions.push(eq(cliAuditActivities.accountId, input.accountId));
  if (input.userId) conditions.push(eq(cliAuditActivities.userId, input.userId));
  if (input.tool) conditions.push(eq(cliAuditActivities.tool, input.tool));
  if (input.mode) conditions.push(eq(cliAuditActivities.mode, input.mode));
  if (input.repo) conditions.push(eq(cliAuditActivities.repo, input.repo));
  if (input.branch) conditions.push(eq(cliAuditActivities.branch, input.branch));

  if (input.eventType) {
    if (typeof input.eventType === "string") {
      conditions.push(eq(cliAuditActivities.eventType, input.eventType));
    } else if (input.eventType.$in) {
      conditions.push(inArray(cliAuditActivities.eventType, input.eventType.$in));
    }
  }

  if (input.from) conditions.push(gte(cliAuditActivities.createdAt, input.from));
  if (input.to) conditions.push(lte(cliAuditActivities.createdAt, input.to));

  if (input.cursor) {
    const cursorDate = new Date(input.cursor.createdAt);
    conditions.push(
      or(
        lt(cliAuditActivities.createdAt, cursorDate),
        and(
          eq(cliAuditActivities.createdAt, cursorDate),
          lt(cliAuditActivities.auditId, input.cursor.auditId)
        )
      )!
    );
  }

  return db.query.cliAuditActivities.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(cliAuditActivities.createdAt), desc(cliAuditActivities.auditId)],
    limit: input.limit
  });
}

export async function findCliAuditActivities(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
): Promise<CliAuditActivityDomain[]> {
  const conditions: SQL[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === "accountId" && typeof value === "string") {
      conditions.push(eq(cliAuditActivities.accountId, value));
      continue;
    }
    if (key === "userId" && typeof value === "string") {
      conditions.push(eq(cliAuditActivities.userId, value));
      continue;
    }
    if (key === "eventType" && typeof value === "string") {
      conditions.push(eq(cliAuditActivities.eventType, value));
      continue;
    }
    throw new Error(`Unsupported cli audit filter field: ${key}`);
  }

  return db.query.cliAuditActivities.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: desc(cliAuditActivities.createdAt)
  });
}

export function createPostgresCliAuditLogRepository(db: BehalfPostgresDb) {
  return {
    find: (filter?: Record<string, unknown>) => findCliAuditActivities(db, filter)
  };
}
