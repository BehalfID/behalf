import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  type SQL
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import {
  siteAccessLogs,
  siteAccessRules,
  siteGuardKeys,
  sites
} from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";

type SiteRow = typeof sites.$inferSelect;
type SiteInsert = typeof sites.$inferInsert;
type RuleRow = typeof siteAccessRules.$inferSelect;
type RuleInsert = typeof siteAccessRules.$inferInsert;
type LogRow = typeof siteAccessLogs.$inferSelect;
type LogInsert = typeof siteAccessLogs.$inferInsert;
type KeyRow = typeof siteGuardKeys.$inferSelect;
type KeyInsert = typeof siteGuardKeys.$inferInsert;

export type SiteDomain = SiteRow;
export type SiteAccessRuleDomain = RuleRow;
export type SiteAccessLogDomain = LogRow;
export type SiteGuardKeyDomain = KeyRow;

const siteColumns: Record<string, AnyPgColumn> = {
  siteId: sites.siteId,
  accountId: sites.accountId,
  developerUserId: sites.developerUserId,
  name: sites.name,
  domain: sites.domain,
  status: sites.status,
  createdAt: sites.createdAt,
  updatedAt: sites.updatedAt
};

const ruleColumns: Record<string, AnyPgColumn> = {
  ruleId: siteAccessRules.ruleId,
  siteId: siteAccessRules.siteId,
  accountId: siteAccessRules.accountId,
  developerUserId: siteAccessRules.developerUserId,
  name: siteAccessRules.name,
  status: siteAccessRules.status,
  agentIdentifier: siteAccessRules.agentIdentifier,
  userAgentPattern: siteAccessRules.userAgentPattern,
  allowedPaths: siteAccessRules.allowedPaths,
  blockedPaths: siteAccessRules.blockedPaths,
  requiresApproval: siteAccessRules.requiresApproval,
  notes: siteAccessRules.notes,
  createdAt: siteAccessRules.createdAt,
  updatedAt: siteAccessRules.updatedAt
};

const logColumns: Record<string, AnyPgColumn> = {
  requestId: siteAccessLogs.requestId,
  siteId: siteAccessLogs.siteId,
  accountId: siteAccessLogs.accountId,
  developerUserId: siteAccessLogs.developerUserId,
  ruleId: siteAccessLogs.ruleId,
  domain: siteAccessLogs.domain,
  path: siteAccessLogs.path,
  userAgent: siteAccessLogs.userAgent,
  agentIdentifier: siteAccessLogs.agentIdentifier,
  allowed: siteAccessLogs.allowed,
  reason: siteAccessLogs.reason,
  risk: siteAccessLogs.risk,
  createdAt: siteAccessLogs.createdAt,
  updatedAt: siteAccessLogs.updatedAt
};

const keyColumns: Record<string, AnyPgColumn> = {
  keyId: siteGuardKeys.keyId,
  siteId: siteGuardKeys.siteId,
  accountId: siteGuardKeys.accountId,
  developerUserId: siteGuardKeys.developerUserId,
  name: siteGuardKeys.name,
  keyHash: siteGuardKeys.keyHash,
  keyPreview: siteGuardKeys.keyPreview,
  status: siteGuardKeys.status,
  lastUsedAt: siteGuardKeys.lastUsedAt,
  createdAt: siteGuardKeys.createdAt,
  updatedAt: siteGuardKeys.updatedAt
};

function fieldCondition(
  columns: Record<string, AnyPgColumn>,
  key: string,
  value: unknown
): SQL {
  const column = columns[key];
  if (!column) throw new Error(`Unsupported site filter field: ${key}`);
  if (value === null || value === undefined) return isNull(column);
  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    const conditions = Object.entries(value as Record<string, unknown>).map(
      ([operator, operand]) => {
        switch (operator) {
          case "$in":
            return inArray(column, operand as unknown[]);
          case "$nin":
            return notInArray(column, operand as unknown[]);
          case "$ne":
            return operand === null
              ? or(ne(column, operand), isNull(column))!
              : ne(column, operand);
          case "$gt":
            return gt(column, operand);
          case "$gte":
            return gte(column, operand);
          case "$lt":
            return lt(column, operand);
          case "$lte":
            return lte(column, operand);
          default:
            throw new Error(`Unsupported site filter operator: ${operator}`);
        }
      }
    );
    return and(...conditions)!;
  }
  return eq(column, value);
}

function buildWhere(
  columns: Record<string, AnyPgColumn>,
  filter: Record<string, unknown> = {}
): SQL | undefined {
  const conditions: SQL[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$or" || key === "$and") {
      const nested = (value as Record<string, unknown>[])
        .map((item) => buildWhere(columns, item))
        .filter(Boolean) as SQL[];
      if (nested.length) conditions.push((key === "$or" ? or(...nested) : and(...nested))!);
      continue;
    }
    conditions.push(fieldCondition(columns, key, value));
  }
  return conditions.length ? and(...conditions) : undefined;
}

function updateValues(
  columns: Record<string, AnyPgColumn>,
  update: Record<string, unknown>
) {
  const source =
    update.$set && typeof update.$set === "object"
      ? (update.$set as Record<string, unknown>)
      : Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$")));
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!columns[key] || key === "createdAt") {
      if (!columns[key]) throw new Error(`Unsupported site update field: ${key}`);
      continue;
    }
    values[key] = value;
  }
  values.updatedAt = new Date();
  return values;
}

export async function findSite(
  db: BehalfPostgresDb,
  filter: {
    accountId: string;
    developerUserId?: string;
    siteId?: string;
    domain?: string | null;
  }
): Promise<SiteDomain | null> {
  const conditions: SQL[] = [eq(sites.accountId, filter.accountId)];
  if (filter.developerUserId) {
    conditions.push(eq(sites.developerUserId, filter.developerUserId));
  }
  if (filter.siteId) conditions.push(eq(sites.siteId, filter.siteId));
  if (filter.domain !== undefined) {
    if (filter.domain === null) conditions.push(isNull(sites.domain));
    else conditions.push(eq(sites.domain, filter.domain));
  }
  return (
    (await db.query.sites.findFirst({
      where: and(...conditions)
    })) ?? null
  );
}

export async function createSite(
  db: BehalfPostgresDb,
  input: {
    siteId: string;
    accountId: string;
    developerUserId: string;
    name: string;
    domain: string;
    status?: "active" | "disabled";
  }
) {
  try {
    const [row] = await db
      .insert(sites)
      .values({
        siteId: input.siteId,
        accountId: input.accountId,
        developerUserId: input.developerUserId,
        name: input.name,
        domain: input.domain,
        status: input.status ?? "active"
      })
      .returning();
    if (!row) throw new Error("createSite failed to return a row");
    return row;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function updateSite(
  db: BehalfPostgresDb,
  siteId: string,
  accountId: string,
  update: Partial<Pick<SiteInsert, "name" | "domain" | "status">>
) {
  try {
    const [row] = await db
      .update(sites)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(sites.siteId, siteId), eq(sites.accountId, accountId)))
      .returning();
    return row ?? null;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function listSites(
  db: BehalfPostgresDb,
  accountId: string,
  developerUserId?: string
): Promise<SiteDomain[]> {
  return db.query.sites.findMany({
    where: and(
      eq(sites.accountId, accountId),
      ...(developerUserId ? [eq(sites.developerUserId, developerUserId)] : [])
    ),
    orderBy: desc(sites.createdAt)
  });
}

export async function createRule(
  db: BehalfPostgresDb,
  input: Omit<RuleInsert, "createdAt" | "updatedAt">
) {
  try {
    const [row] = await db.insert(siteAccessRules).values(input).returning();
    if (!row) throw new Error("createRule failed to return a row");
    return row;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function updateRule(
  db: BehalfPostgresDb,
  ruleId: string,
  accountId: string,
  update: Partial<
    Pick<
      RuleInsert,
      | "name"
      | "status"
      | "agentIdentifier"
      | "userAgentPattern"
      | "allowedPaths"
      | "blockedPaths"
      | "requiresApproval"
      | "notes"
    >
  >
) {
  const [row] = await db
    .update(siteAccessRules)
    .set({ ...update, updatedAt: new Date() })
    .where(and(eq(siteAccessRules.ruleId, ruleId), eq(siteAccessRules.accountId, accountId)))
    .returning();
  return row ?? null;
}

export async function deleteRule(db: BehalfPostgresDb, ruleId: string, accountId: string) {
  const rows = await db
    .delete(siteAccessRules)
    .where(and(eq(siteAccessRules.ruleId, ruleId), eq(siteAccessRules.accountId, accountId)))
    .returning({ ruleId: siteAccessRules.ruleId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function findRulesBySite(
  db: BehalfPostgresDb,
  siteId: string,
  filter?: { accountId?: string; developerUserId?: string }
): Promise<SiteAccessRuleDomain[]> {
  return db.query.siteAccessRules.findMany({
    where: and(
      eq(siteAccessRules.siteId, siteId),
      ...(filter?.accountId ? [eq(siteAccessRules.accountId, filter.accountId)] : []),
      ...(filter?.developerUserId
        ? [eq(siteAccessRules.developerUserId, filter.developerUserId)]
        : [])
    ),
    orderBy: desc(siteAccessRules.createdAt)
  });
}

export async function createAccessLog(
  db: BehalfPostgresDb,
  input: Omit<LogInsert, "createdAt" | "updatedAt">
) {
  try {
    const [row] = await db.insert(siteAccessLogs).values(input).returning();
    if (!row) throw new Error("createAccessLog failed to return a row");
    return row;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function listAccessLogs(
  db: BehalfPostgresDb,
  accountId: string,
  options?: { siteId?: string; developerUserId?: string; limit?: number }
): Promise<SiteAccessLogDomain[]> {
  return db.query.siteAccessLogs.findMany({
    where: and(
      eq(siteAccessLogs.accountId, accountId),
      ...(options?.siteId ? [eq(siteAccessLogs.siteId, options.siteId)] : []),
      ...(options?.developerUserId
        ? [eq(siteAccessLogs.developerUserId, options.developerUserId)]
        : [])
    ),
    orderBy: desc(siteAccessLogs.createdAt),
    limit: options?.limit ?? 100
  });
}

export async function findKeyByHash(
  db: BehalfPostgresDb,
  keyHash: string
): Promise<SiteGuardKeyDomain | null> {
  return (
    (await db.query.siteGuardKeys.findFirst({
      where: eq(siteGuardKeys.keyHash, keyHash)
    })) ?? null
  );
}

export async function createKey(
  db: BehalfPostgresDb,
  input: Omit<KeyInsert, "createdAt" | "updatedAt">
) {
  try {
    const [row] = await db.insert(siteGuardKeys).values(input).returning();
    if (!row) throw new Error("createKey failed to return a row");
    return row;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function revokeKey(db: BehalfPostgresDb, keyId: string, accountId: string) {
  const rows = await db
    .update(siteGuardKeys)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(and(eq(siteGuardKeys.keyId, keyId), eq(siteGuardKeys.accountId, accountId)))
    .returning({ keyId: siteGuardKeys.keyId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function listKeys(
  db: BehalfPostgresDb,
  accountId: string,
  options?: { siteId?: string; developerUserId?: string }
): Promise<SiteGuardKeyDomain[]> {
  return db.query.siteGuardKeys.findMany({
    where: and(
      eq(siteGuardKeys.accountId, accountId),
      ...(options?.siteId ? [eq(siteGuardKeys.siteId, options.siteId)] : []),
      ...(options?.developerUserId
        ? [eq(siteGuardKeys.developerUserId, options.developerUserId)]
        : [])
    ),
    orderBy: desc(siteGuardKeys.createdAt)
  });
}

export async function touchLastUsed(
  db: BehalfPostgresDb,
  keyId: string,
  usedAt = new Date()
) {
  const rows = await db
    .update(siteGuardKeys)
    .set({ lastUsedAt: usedAt, updatedAt: new Date() })
    .where(eq(siteGuardKeys.keyId, keyId))
    .returning({ keyId: siteGuardKeys.keyId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function findSites(db: BehalfPostgresDb, filter: Record<string, unknown> = {}) {
  return db.query.sites.findMany({
    where: buildWhere(siteColumns, filter),
    orderBy: desc(sites.createdAt)
  });
}

export async function createSiteDocument(db: BehalfPostgresDb, input: Record<string, unknown>) {
  return createSite(db, input as Parameters<typeof createSite>[1]);
}

export async function findOneSite(db: BehalfPostgresDb, filter: Record<string, unknown>) {
  return (
    (await db.query.sites.findFirst({
      where: buildWhere(siteColumns, filter)
    })) ?? null
  );
}

export async function findOneAndUpdateSite(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  const before = await findOneSite(db, filter);
  if (!before) return null;
  const [row] = await db
    .update(sites)
    .set(updateValues(siteColumns, update) as Partial<SiteInsert>)
    .where(eq(sites.siteId, before.siteId))
    .returning();
  const returnAfter = options.returnDocument === "after" || options.new === true;
  return returnAfter ? (row ?? null) : before;
}

export async function findRules(db: BehalfPostgresDb, filter: Record<string, unknown> = {}) {
  return db.query.siteAccessRules.findMany({
    where: buildWhere(ruleColumns, filter),
    orderBy: desc(siteAccessRules.createdAt)
  });
}

export async function createRuleDocument(db: BehalfPostgresDb, input: Record<string, unknown>) {
  return createRule(db, input as Omit<RuleInsert, "createdAt" | "updatedAt">);
}

export async function findOneRule(db: BehalfPostgresDb, filter: Record<string, unknown>) {
  return (
    (await db.query.siteAccessRules.findFirst({
      where: buildWhere(ruleColumns, filter)
    })) ?? null
  );
}

export async function findOneAndUpdateRule(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  const before = await findOneRule(db, filter);
  if (!before) return null;
  const [row] = await db
    .update(siteAccessRules)
    .set(updateValues(ruleColumns, update) as Partial<RuleInsert>)
    .where(eq(siteAccessRules.ruleId, before.ruleId))
    .returning();
  const returnAfter = options.returnDocument === "after" || options.new === true;
  return returnAfter ? (row ?? null) : before;
}

export async function findAccessLogs(db: BehalfPostgresDb, filter: Record<string, unknown> = {}) {
  return db.query.siteAccessLogs.findMany({
    where: buildWhere(logColumns, filter),
    orderBy: desc(siteAccessLogs.createdAt)
  });
}

export async function findKeys(db: BehalfPostgresDb, filter: Record<string, unknown> = {}) {
  return db.query.siteGuardKeys.findMany({
    where: buildWhere(keyColumns, filter),
    orderBy: desc(siteGuardKeys.createdAt)
  });
}

export async function createKeyDocument(db: BehalfPostgresDb, input: Record<string, unknown>) {
  return createKey(db, input as Omit<KeyInsert, "createdAt" | "updatedAt">);
}

export async function findOneAndUpdateKey(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  const before =
    (await db.query.siteGuardKeys.findFirst({
      where: buildWhere(keyColumns, filter)
    })) ?? null;
  if (!before) return null;
  const [row] = await db
    .update(siteGuardKeys)
    .set(updateValues(keyColumns, update) as Partial<KeyInsert>)
    .where(eq(siteGuardKeys.keyId, before.keyId))
    .returning();
  const returnAfter = options.returnDocument === "after" || options.new === true;
  return returnAfter ? (row ?? null) : before;
}

export function createPostgresSiteRepository(db: BehalfPostgresDb) {
  return {
    create: (input: Record<string, unknown>) => createSiteDocument(db, input),
    find: (filter?: Record<string, unknown>) => findSites(db, filter),
    findOne: (filter: Record<string, unknown>) => findOneSite(db, filter),
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => findOneAndUpdateSite(db, filter, update, options)
  };
}

export function createPostgresSiteAccessRuleRepository(db: BehalfPostgresDb) {
  return {
    create: (input: Record<string, unknown>) => createRuleDocument(db, input),
    find: (filter?: Record<string, unknown>) => findRules(db, filter),
    findOne: (filter: Record<string, unknown>) => findOneRule(db, filter),
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => findOneAndUpdateRule(db, filter, update, options)
  };
}

export function createPostgresSiteAccessLogRepository(db: BehalfPostgresDb) {
  return {
    find: (filter?: Record<string, unknown>) => findAccessLogs(db, filter)
  };
}

export function createPostgresSiteGuardKeyRepository(db: BehalfPostgresDb) {
  return {
    create: (input: Record<string, unknown>) => createKeyDocument(db, input),
    find: (filter?: Record<string, unknown>) => findKeys(db, filter),
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => findOneAndUpdateKey(db, filter, update, options)
  };
}
