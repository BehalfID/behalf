import {
  and,
  arrayContains,
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
import { permissions } from "@/lib/db/postgres/schema";
import type {
  CreatePermissionInput,
  PermissionScope
} from "@/lib/repositories/permissions";

export type PostgresPermission = typeof permissions.$inferSelect;
export type PermissionFindOptions = {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
};

type PermissionValues = typeof permissions.$inferInsert;
type PermissionUpdate = Partial<PermissionValues>;

const columns: Record<string, AnyPgColumn> = {
  permissionId: permissions.permissionId,
  accountId: permissions.accountId,
  developerUserId: permissions.developerUserId,
  agentId: permissions.agentId,
  action: permissions.action,
  description: permissions.description,
  resource: permissions.resource,
  scope: permissions.scope,
  allowedActions: permissions.allowedActions,
  blockedActions: permissions.blockedActions,
  requiresApproval: permissions.requiresApproval,
  notes: permissions.notes,
  template: permissions.template,
  constraints: permissions.constraints,
  status: permissions.status,
  requiredAuthorityLevel: permissions.requiredAuthorityLevel,
  createdBy: permissions.createdBy,
  updatedBy: permissions.updatedBy,
  lastUsedAt: permissions.lastUsedAt,
  createdAt: permissions.createdAt,
  updatedAt: permissions.updatedAt
};

function columnFor(key: string) {
  const column = columns[key];
  if (!column) {
    throw new Error(`Unsupported permission filter field: ${key}`);
  }
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
          throw new Error(`Unsupported permission filter operator: ${operator}`);
      }
    });
    return and(...operators)!;
  }

  if ((key === "allowedActions" || key === "blockedActions") && typeof value === "string") {
    return arrayContains(column, [value]);
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

function normalizeConstraints(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const constraints = { ...(value as Record<string, unknown>) };
  if (typeof constraints.expiresAt === "string") {
    constraints.expiresAt = new Date(constraints.expiresAt);
  }
  return constraints;
}

function normalizeRow(row: PostgresPermission): PostgresPermission {
  return {
    ...row,
    allowedActions: row.allowedActions ?? [],
    blockedActions: row.blockedActions ?? [],
    constraints: normalizeConstraints(row.constraints)
  };
}

function normalizeValues(input: Record<string, unknown>): PermissionUpdate {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!columns[key] || key === "createdAt" || key === "updatedAt") {
      if (!columns[key]) throw new Error(`Unsupported permission update field: ${key}`);
      continue;
    }
    result[key] = value;
  }
  return result as PermissionUpdate;
}

function updateValues(update: Record<string, unknown>): PermissionUpdate {
  const set =
    update.$set && typeof update.$set === "object"
      ? normalizeValues(update.$set as Record<string, unknown>)
      : normalizeValues(Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$"))));

  if (update.$unset && typeof update.$unset === "object") {
    for (const key of Object.keys(update.$unset as Record<string, unknown>)) {
      if (!columns[key]) throw new Error(`Unsupported permission update field: ${key}`);
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

export async function findMatchingForVerify(
  db: BehalfPostgresDb,
  agentId: string,
  action: string
) {
  const rows = await db
    .select()
    .from(permissions)
    .where(
      and(
        eq(permissions.agentId, agentId),
        or(
          eq(permissions.action, action),
          arrayContains(permissions.allowedActions, [action]),
          arrayContains(permissions.blockedActions, [action])
        )
      )
    )
    .orderBy(desc(permissions.createdAt));
  return rows.map(normalizeRow);
}

export async function createPermission(db: BehalfPostgresDb, input: CreatePermissionInput) {
  const [row] = await db
    .insert(permissions)
    .values(input as PermissionValues)
    .returning();
  if (!row) throw new Error("createPermission failed to return a row");
  return normalizeRow(row);
}

export async function findPermissions(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {},
  options: PermissionFindOptions = {}
) {
  let query = db
    .select()
    .from(permissions)
    .where(buildWhere(filter))
    .$dynamic();
  const orderBy = orderByFrom(options.sort);
  if (orderBy.length) query = query.orderBy(...orderBy);
  if (options.skip !== undefined) query = query.offset(options.skip);
  if (options.limit !== undefined) query = query.limit(options.limit);
  return (await query).map(normalizeRow);
}

export async function findOnePermission(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) {
  const [row] = await db.select().from(permissions).where(buildWhere(filter)).limit(1);
  return row ? normalizeRow(row) : null;
}

export function findByPermissionId(
  db: BehalfPostgresDb,
  permissionId: string,
  scope: PermissionScope = {}
) {
  return findOnePermission(db, { ...scope, permissionId });
}

export function findPermissionsByAgentId(
  db: BehalfPostgresDb,
  agentId: string,
  scope: PermissionScope = {}
) {
  return findPermissions(db, { ...scope, agentId });
}

export function findActivePermissionsByAgentId(
  db: BehalfPostgresDb,
  agentId: string,
  scope: PermissionScope = {}
) {
  return findPermissions(db, { ...scope, agentId, status: "active" });
}

export async function updatePermission(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({ permissionId: permissions.permissionId })
      .from(permissions)
      .where(buildWhere(filter))
      .limit(1);
    if (!match) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    }
    const rows = await tx
      .update(permissions)
      .set(updateValues(update))
      .where(eq(permissions.permissionId, match.permissionId))
      .returning({ permissionId: permissions.permissionId });
    return { acknowledged: true, matchedCount: 1, modifiedCount: rows.length };
  });
}

export async function updatePermissions(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  const rows = await db
    .update(permissions)
    .set(updateValues(update))
    .where(buildWhere(filter))
    .returning({ permissionId: permissions.permissionId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export function revokePermission(
  db: BehalfPostgresDb,
  permissionId: string,
  scope: PermissionScope = {},
  updatedBy?: string
) {
  return updatePermission(
    db,
    { ...scope, permissionId },
    { $set: { status: "revoked", ...(updatedBy ? { updatedBy } : {}) } }
  );
}

export async function findOneAndUpdatePermission(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  const before = await findOnePermission(db, filter);
  if (!before) return null;
  await updatePermission(db, filter, update);
  const returnAfter = options.returnDocument === "after" || options.new === true;
  return returnAfter ? findOnePermission(db, { permissionId: before.permissionId }) : before;
}

export async function deletePermission(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({ permissionId: permissions.permissionId })
      .from(permissions)
      .where(buildWhere(filter))
      .limit(1);
    if (!match) return { acknowledged: true, deletedCount: 0 };
    const rows = await tx
      .delete(permissions)
      .where(eq(permissions.permissionId, match.permissionId))
      .returning({ permissionId: permissions.permissionId });
    return { acknowledged: true, deletedCount: rows.length };
  });
}

export async function deletePermissions(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) {
  const rows = await db
    .delete(permissions)
    .where(buildWhere(filter))
    .returning({ permissionId: permissions.permissionId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function countPermissions(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
) {
  const [row] = await db
    .select({ value: count() })
    .from(permissions)
    .where(buildWhere(filter));
  return row?.value ?? 0;
}

export function createPostgresPermissionRepository(db: BehalfPostgresDb) {
  return {
    findMatchingForVerify: (agentId: string, action: string) =>
      findMatchingForVerify(db, agentId, action),
    create: (input: CreatePermissionInput) => createPermission(db, input),
    find: (filter?: Record<string, unknown>, options?: PermissionFindOptions) =>
      findPermissions(db, filter, options),
    findOne: (filter: Record<string, unknown>) => findOnePermission(db, filter),
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => findOneAndUpdatePermission(db, filter, update, options),
    findByPermissionId: (permissionId: string, scope?: PermissionScope) =>
      findByPermissionId(db, permissionId, scope),
    revoke: (
      permissionId: string,
      scope?: PermissionScope,
      updatedBy?: string
    ) => revokePermission(db, permissionId, scope, updatedBy),
    findByAgentId: (agentId: string, scope?: PermissionScope) =>
      findPermissionsByAgentId(db, agentId, scope),
    findActiveByAgentId: (agentId: string, scope?: PermissionScope) =>
      findActivePermissionsByAgentId(db, agentId, scope),
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
      updatePermission(db, filter, update),
    updateMany: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
      updatePermissions(db, filter, update),
    deleteOne: (filter: Record<string, unknown>) => deletePermission(db, filter),
    deleteMany: (filter: Record<string, unknown>) => deletePermissions(db, filter),
    countDocuments: (filter?: Record<string, unknown>) => countPermissions(db, filter)
  };
}

export type PostgresPermissionRepository = ReturnType<typeof createPostgresPermissionRepository>;
