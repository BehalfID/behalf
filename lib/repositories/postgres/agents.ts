import {
  and,
  asc,
  count,
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
import { agents } from "@/lib/db/postgres/schema";
import type { AgentCountScope } from "@/lib/repositories/agents";
import { translatePostgresError } from "@/lib/repositories/errors";

type AgentRow = typeof agents.$inferSelect;
type AgentInsert = typeof agents.$inferInsert;
type AgentUpdate = Partial<AgentInsert>;

const columns: Record<string, AnyPgColumn> = {
  agentId: agents.agentId,
  accountId: agents.accountId,
  developerUserId: agents.developerUserId,
  name: agents.name,
  agentType: agents.agentType,
  provider: agents.provider,
  externalAgentId: agents.externalAgentId,
  externalAgentLabel: agents.externalAgentLabel,
  connectionStatus: agents.connectionStatus,
  description: agents.description,
  guidelines: agents.guidelines,
  publicPassportTokenHash: agents.publicPassportTokenHash,
  publicPassportTokenPreview: agents.publicPassportTokenPreview,
  publicPassportEnabled: agents.publicPassportEnabled,
  apiKeyHash: agents.apiKeyHash,
  lastUsedAt: agents.lastUsedAt,
  keyRotatedAt: agents.keyRotatedAt,
  status: agents.status,
  createdAt: agents.createdAt,
  updatedAt: agents.updatedAt
};

function columnFor(key: string) {
  const column = columns[key];
  if (!column) throw new Error(`Unsupported agent filter field: ${key}`);
  return column;
}

function fieldCondition(key: string, value: unknown): SQL {
  const column = columnFor(key);
  if (value === null) return isNull(column);

  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    const operators = Object.entries(value as Record<string, unknown>).map(([operator, operand]) => {
      switch (operator) {
        case "$in":
          return inArray(column, operand as unknown[]);
        case "$nin":
          return notInArray(column, operand as unknown[]);
        case "$ne":
          return operand === null ? or(ne(column, operand), isNull(column))! : ne(column, operand);
        case "$gt":
          return gt(column, operand);
        case "$gte":
          return gte(column, operand);
        case "$lt":
          return lt(column, operand);
        case "$lte":
          return lte(column, operand);
        default:
          throw new Error(`Unsupported agent filter operator: ${operator}`);
      }
    });
    return and(...operators)!;
  }

  return eq(column, value);
}

function buildWhere(filter: Record<string, unknown> = {}): SQL | undefined {
  const conditions: SQL[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$or") {
      const alternatives = (value as Record<string, unknown>[]).map(buildWhere).filter(Boolean) as SQL[];
      if (alternatives.length) conditions.push(or(...alternatives)!);
      continue;
    }
    if (key === "$and") {
      const conjunctions = (value as Record<string, unknown>[]).map(buildWhere).filter(Boolean) as SQL[];
      if (conjunctions.length) conditions.push(and(...conjunctions)!);
      continue;
    }
    conditions.push(fieldCondition(key, value));
  }
  return conditions.length ? and(...conditions) : undefined;
}

function normalizeValues(input: Record<string, unknown>): AgentUpdate {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!columns[key] || key === "createdAt" || key === "updatedAt") {
      if (!columns[key]) throw new Error(`Unsupported agent update field: ${key}`);
      continue;
    }
    result[key] = value;
  }
  return result as AgentUpdate;
}

function updateValues(update: Record<string, unknown>): AgentUpdate {
  const set =
    update.$set && typeof update.$set === "object"
      ? normalizeValues(update.$set as Record<string, unknown>)
      : normalizeValues(Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$"))));

  if (update.$unset && typeof update.$unset === "object") {
    for (const key of Object.keys(update.$unset as Record<string, unknown>)) {
      if (!columns[key]) throw new Error(`Unsupported agent update field: ${key}`);
      (set as Record<string, unknown>)[key] = null;
    }
  }
  return { ...set, updatedAt: new Date() };
}

function orderByFrom(sort: Record<string, 1 | -1> = {}) {
  return Object.entries(sort).map(([key, direction]) =>
    direction === -1 ? desc(columnFor(key)) : asc(columnFor(key))
  );
}

export async function countAgentsByAccountId(db: BehalfPostgresDb, accountId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(agents)
    .where(eq(agents.accountId, accountId));
  return row?.value ?? 0;
}

export async function countAgentsByScope(db: BehalfPostgresDb, scope: AgentCountScope) {
  const filter =
    "accountId" in scope
      ? eq(agents.accountId, scope.accountId)
      : eq(agents.developerUserId, scope.developerUserId);
  const [row] = await db.select({ value: count() }).from(agents).where(filter);
  return row?.value ?? 0;
}

export async function createAgent(db: BehalfPostgresDb, input: Partial<AgentInsert>) {
  try {
    const [row] = await db
      .insert(agents)
      .values(input as AgentInsert)
      .returning();
    if (!row) throw new Error("createAgent failed to return a row");
    return row;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findAgentByAgentId(
  db: BehalfPostgresDb,
  agentId: string,
  scope: Record<string, unknown> = {},
  _select?: string
): Promise<AgentRow | null> {
  const [row] = await db
    .select()
    .from(agents)
    .where(buildWhere({ ...scope, agentId }))
    .limit(1);
  return row ?? null;
}

export async function findAgentByApiKeyHash(
  db: BehalfPostgresDb,
  apiKeyHash: string,
  _select = "+apiKeyHash"
): Promise<AgentRow | null> {
  const [row] = await db.select().from(agents).where(eq(agents.apiKeyHash, apiKeyHash)).limit(1);
  return row ?? null;
}

export async function listAgents(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  options: { select?: string; sort?: Record<string, 1 | -1> } = {}
): Promise<AgentRow[]> {
  let query = db.select().from(agents).where(buildWhere(filter)).$dynamic();
  const orderBy = orderByFrom(options.sort);
  if (orderBy.length) query = query.orderBy(...orderBy);
  return query;
}

export async function updateAgent(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({ agentId: agents.agentId })
      .from(agents)
      .where(buildWhere(filter))
      .limit(1);
    if (!match) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    const rows = await tx
      .update(agents)
      .set(updateValues(update))
      .where(eq(agents.agentId, match.agentId))
      .returning({ agentId: agents.agentId });
    return { acknowledged: true, matchedCount: 1, modifiedCount: rows.length };
  });
}

export async function updateAgents(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  const rows = await db
    .update(agents)
    .set(updateValues(update))
    .where(buildWhere(filter))
    .returning({ agentId: agents.agentId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function deleteAgents(db: BehalfPostgresDb, filter: Record<string, unknown>) {
  const rows = await db
    .delete(agents)
    .where(buildWhere(filter))
    .returning({ agentId: agents.agentId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function rotateAgentKey(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  apiKeyHash: string,
  keyRotatedAt = new Date()
) {
  return updateAgent(db, filter, { $set: { apiKeyHash, keyRotatedAt } });
}

export async function touchAgentLastUsedAt(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  lastUsedAt = new Date()
) {
  return updateAgent(db, filter, { $set: { lastUsedAt } });
}
