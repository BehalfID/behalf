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
  sql,
  type SQL
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import {
  webhookDeliveries,
  webhookEndpoints,
  webhookEvents
} from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";

type EndpointRow = typeof webhookEndpoints.$inferSelect;
type EndpointInsert = typeof webhookEndpoints.$inferInsert;
type EventRow = typeof webhookEvents.$inferSelect;
type EventInsert = typeof webhookEvents.$inferInsert;
type DeliveryRow = typeof webhookDeliveries.$inferSelect;
type DeliveryInsert = typeof webhookDeliveries.$inferInsert;

export type WebhookEndpointDomain = EndpointRow;
export type WebhookEventDomain = EventRow;
export type WebhookDeliveryDomain = DeliveryRow;

export type WebhookListOptions = {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  select?: string;
};

type DomainRow = Record<string, unknown>;

const endpointColumns: Record<string, AnyPgColumn> = {
  webhookId: webhookEndpoints.webhookId,
  accountId: webhookEndpoints.accountId,
  developerUserId: webhookEndpoints.developerUserId,
  url: webhookEndpoints.url,
  secretHash: webhookEndpoints.secretHash,
  secretPreview: webhookEndpoints.secretPreview,
  events: webhookEndpoints.events,
  status: webhookEndpoints.status,
  lastTriggeredAt: webhookEndpoints.lastTriggeredAt,
  createdAt: webhookEndpoints.createdAt,
  updatedAt: webhookEndpoints.updatedAt
};

const eventColumns: Record<string, AnyPgColumn> = {
  eventId: webhookEvents.eventId,
  accountId: webhookEvents.accountId,
  developerUserId: webhookEvents.developerUserId,
  type: webhookEvents.type,
  payload: webhookEvents.payload,
  status: webhookEvents.status,
  attempts: webhookEvents.attempts,
  nextAttemptAt: webhookEvents.nextAttemptAt,
  processingStartedAt: webhookEvents.processingStartedAt,
  deadLetter: webhookEvents.deadLetter,
  lastError: webhookEvents.lastError,
  completedAt: webhookEvents.completedAt,
  createdAt: webhookEvents.createdAt,
  updatedAt: webhookEvents.updatedAt
};

const deliveryColumns: Record<string, AnyPgColumn> = {
  deliveryId: webhookDeliveries.deliveryId,
  accountId: webhookDeliveries.accountId,
  developerUserId: webhookDeliveries.developerUserId,
  webhookId: webhookDeliveries.webhookId,
  eventId: webhookDeliveries.eventId,
  eventType: webhookDeliveries.eventType,
  status: webhookDeliveries.status,
  httpStatus: webhookDeliveries.httpStatus,
  error: webhookDeliveries.error,
  attempt: webhookDeliveries.attempt,
  nextRetryAt: webhookDeliveries.nextRetryAt,
  maxAttempts: webhookDeliveries.maxAttempts,
  createdAt: webhookDeliveries.createdAt
};

function normalizeJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function normalizeWebhookEndpoint(row: EndpointRow): WebhookEndpointDomain {
  return {
    webhookId: row.webhookId,
    accountId: row.accountId,
    developerUserId: row.developerUserId,
    url: row.url,
    secretHash: row.secretHash,
    secretPreview: row.secretPreview,
    events: [...row.events],
    status: row.status,
    lastTriggeredAt: row.lastTriggeredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function normalizeWebhookEvent(row: EventRow): WebhookEventDomain {
  return {
    eventId: row.eventId,
    accountId: row.accountId,
    developerUserId: row.developerUserId,
    type: row.type,
    payload: normalizeJson(row.payload),
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    processingStartedAt: row.processingStartedAt,
    deadLetter: row.deadLetter,
    lastError: row.lastError,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function normalizeWebhookDelivery(row: DeliveryRow): WebhookDeliveryDomain {
  return {
    deliveryId: row.deliveryId,
    accountId: row.accountId,
    developerUserId: row.developerUserId,
    webhookId: row.webhookId,
    eventId: row.eventId,
    eventType: row.eventType,
    status: row.status,
    httpStatus: row.httpStatus,
    error: row.error,
    attempt: row.attempt,
    nextRetryAt: row.nextRetryAt,
    maxAttempts: row.maxAttempts,
    createdAt: row.createdAt
  };
}

function project<T extends DomainRow>(row: T, select?: string): Partial<T> {
  if (!select) return row;
  const tokens = select.trim().split(/\s+/).filter(Boolean);
  const included = tokens
    .filter((token) => !token.startsWith("-") && !token.startsWith("+"))
    .map((token) => token.replace(/^\+/, ""));
  const forced = tokens
    .filter((token) => token.startsWith("+"))
    .map((token) => token.slice(1));
  if (included.length) {
    return Object.fromEntries(
      [...included, ...forced]
        .filter((key) => key !== "_id" && key in row)
        .map((key) => [key, row[key]])
    ) as Partial<T>;
  }
  const excluded = new Set(tokens.map((token) => token.replace(/^-/, "")));
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !excluded.has(key))
  ) as Partial<T>;
}

function projectEndpoint(
  row: WebhookEndpointDomain,
  select?: string
): Partial<WebhookEndpointDomain> {
  const explicitlyIncludesSecret = Boolean(
    select?.split(/\s+/).some((token) => token === "+secretHash" || token === "secretHash")
  );
  const visible = explicitlyIncludesSecret
    ? row
    : (Object.fromEntries(
        Object.entries(row).filter(([key]) => key !== "secretHash")
      ) as WebhookEndpointDomain);
  return project(visible as DomainRow, select) as Partial<WebhookEndpointDomain>;
}

function fieldCondition(
  columns: Record<string, AnyPgColumn>,
  key: string,
  value: unknown
): SQL {
  if (key.startsWith("payload.")) {
    const path = key.slice("payload.".length).split(".");
    let expression: SQL = sql`${webhookEvents.payload}`;
    for (let index = 0; index < path.length; index += 1) {
      const part = path[index]!;
      expression =
        index === path.length - 1
          ? sql`(${expression}->>${part})`
          : sql`(${expression}->${part})`;
    }
    if (value instanceof RegExp) {
      return value.flags.includes("i")
        ? sql`${expression} ~* ${value.source}`
        : sql`${expression} ~ ${value.source}`;
    }
    if (value === null || value === undefined) return sql`${expression} IS NULL`;
    return sql`${expression} = ${value}`;
  }

  const column = columns[key];
  if (!column) throw new Error(`Unsupported webhook filter field: ${key}`);
  if (value === null || value === undefined) return isNull(column);
  if (value instanceof RegExp) {
    return value.flags.includes("i")
      ? sql`${column} ~* ${value.source}`
      : sql`${column} ~ ${value.source}`;
  }

  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    const conditions = Object.entries(value as Record<string, unknown>).map(
      ([operator, operand]) => {
        switch (operator) {
          case "$in":
            return inArray(column, operand as unknown[]);
          case "$nin":
            return notInArray(column, operand as unknown[]);
          case "$ne":
            return operand === null ? sql`${column} IS NOT NULL` : ne(column, operand);
          case "$gt":
            return gt(column, operand);
          case "$gte":
            return gte(column, operand);
          case "$lt":
            return lt(column, operand);
          case "$lte":
            return lte(column, operand);
          case "$exists":
            return operand ? sql`${column} IS NOT NULL` : isNull(column);
          default:
            throw new Error(`Unsupported webhook filter operator: ${operator}`);
        }
      }
    );
    return and(...conditions)!;
  }

  if (key === "events" && typeof value === "string") {
    return arrayContains(column, [value]);
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

function orderByFrom(
  columns: Record<string, AnyPgColumn>,
  sort: Record<string, 1 | -1>,
  tieBreaker: string
) {
  const order = Object.entries(sort).map(([key, direction]) => {
    const column = columns[key];
    if (!column) throw new Error(`Unsupported webhook sort field: ${key}`);
    return direction === -1 ? desc(column) : asc(column);
  });
  if (!Object.hasOwn(sort, tieBreaker)) {
    const tieColumn = columns[tieBreaker]!;
    const direction = Object.values(sort)[0] === 1 ? 1 : -1;
    order.push(direction === 1 ? asc(tieColumn) : desc(tieColumn));
  }
  return order;
}

function updateValues(
  columns: Record<string, AnyPgColumn>,
  update: Record<string, unknown>,
  includeUpdatedAt: boolean
) {
  const source =
    update.$set && typeof update.$set === "object"
      ? (update.$set as Record<string, unknown>)
      : Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith("$")));
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!columns[key] || key === "createdAt") {
      if (!columns[key]) throw new Error(`Unsupported webhook update field: ${key}`);
      continue;
    }
    values[key] = value;
  }
  if (update.$unset && typeof update.$unset === "object") {
    for (const key of Object.keys(update.$unset as Record<string, unknown>)) {
      if (!columns[key]) throw new Error(`Unsupported webhook update field: ${key}`);
      values[key] = null;
    }
  }
  if (update.$inc && typeof update.$inc === "object") {
    for (const [key, amount] of Object.entries(update.$inc as Record<string, number>)) {
      const column = columns[key];
      if (!column) throw new Error(`Unsupported webhook update field: ${key}`);
      values[key] = sql`${column} + ${amount}`;
    }
  }
  if (includeUpdatedAt) values.updatedAt = new Date();
  return values;
}

export async function createEndpoint(db: BehalfPostgresDb, input: Record<string, unknown>) {
  try {
    const [row] = await db
      .insert(webhookEndpoints)
      .values(input as EndpointInsert)
      .returning();
    if (!row) throw new Error("createEndpoint failed to return a row");
    return normalizeWebhookEndpoint(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function createEvent(db: BehalfPostgresDb, input: Record<string, unknown>) {
  try {
    const [row] = await db.insert(webhookEvents).values(input as EventInsert).returning();
    if (!row) throw new Error("createEvent failed to return a row");
    return normalizeWebhookEvent(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findEndpoint(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  select?: string
) {
  const [row] = await db
    .select()
    .from(webhookEndpoints)
    .where(buildWhere(endpointColumns, filter))
    .limit(1);
  return row ? projectEndpoint(normalizeWebhookEndpoint(row), select) : null;
}

export async function listEndpoints(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {},
  selectOrOptions: string | WebhookListOptions = {}
) {
  const options =
    typeof selectOrOptions === "string"
      ? ({ select: selectOrOptions } satisfies WebhookListOptions)
      : selectOrOptions;
  let query = db
    .select()
    .from(webhookEndpoints)
    .where(buildWhere(endpointColumns, filter))
    .$dynamic();
  const ordering = orderByFrom(
    endpointColumns,
    options.sort ?? { createdAt: -1 },
    "webhookId"
  );
  query = query.orderBy(...ordering);
  if (options.skip !== undefined) query = query.offset(options.skip);
  if (options.limit !== undefined) query = query.limit(options.limit);
  return (await query).map((row) =>
    projectEndpoint(normalizeWebhookEndpoint(row), options.select)
  );
}

export async function findActiveEndpointsForEvent(
  db: BehalfPostgresDb,
  event: { accountId: string; developerUserId?: string | null; type: string }
) {
  const scope = event.developerUserId
    ? eq(webhookEndpoints.developerUserId, event.developerUserId)
    : eq(webhookEndpoints.accountId, event.accountId);
  const rows = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        scope,
        eq(webhookEndpoints.status, "active"),
        arrayContains(webhookEndpoints.events, [event.type])
      )
    )
    .orderBy(asc(webhookEndpoints.createdAt), asc(webhookEndpoints.webhookId));
  return rows.map(normalizeWebhookEndpoint);
}

export async function updateEndpoint(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  const target = db
    .select({ webhookId: webhookEndpoints.webhookId })
    .from(webhookEndpoints)
    .where(buildWhere(endpointColumns, filter))
    .limit(1);
  const rows = await db
    .update(webhookEndpoints)
    .set(updateValues(endpointColumns, update, true))
    .where(inArray(webhookEndpoints.webhookId, target))
    .returning({ webhookId: webhookEndpoints.webhookId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function updateEndpoints(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  const rows = await db
    .update(webhookEndpoints)
    .set(updateValues(endpointColumns, update, true))
    .where(buildWhere(endpointColumns, filter))
    .returning({ webhookId: webhookEndpoints.webhookId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function listEvents(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {},
  options: WebhookListOptions = {}
) {
  let query = db
    .select()
    .from(webhookEvents)
    .where(buildWhere(eventColumns, filter))
    .$dynamic();
  query = query.orderBy(
    ...orderByFrom(eventColumns, options.sort ?? { createdAt: -1 }, "eventId")
  );
  if (options.skip !== undefined) query = query.offset(options.skip);
  if (options.limit !== undefined) query = query.limit(options.limit);
  return (await query).map((row) => project(normalizeWebhookEvent(row), options.select));
}

export async function findEvent(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  select?: string
) {
  const [row] = await db
    .select()
    .from(webhookEvents)
    .where(buildWhere(eventColumns, filter))
    .limit(1);
  return row ? project(normalizeWebhookEvent(row), select) : null;
}

export async function recoverStuckEvents(
  db: BehalfPostgresDb,
  stuckBefore: Date,
  maxAttempts: number
) {
  const now = new Date();
  const base = and(
    eq(webhookEvents.status, "processing"),
    lte(webhookEvents.processingStartedAt, stuckBefore),
    eq(webhookEvents.deadLetter, false)
  );
  const recovered = await db
    .update(webhookEvents)
    .set({
      status: "pending",
      nextAttemptAt: now,
      processingStartedAt: null,
      updatedAt: now
    })
    .where(and(base, lt(webhookEvents.attempts, maxAttempts)))
    .returning({ eventId: webhookEvents.eventId });
  const deadLettered = await db
    .update(webhookEvents)
    .set({
      status: "failed",
      deadLetter: true,
      lastError: "Webhook delivery timed out while processing and reached maximum attempts.",
      nextAttemptAt: now,
      processingStartedAt: null,
      updatedAt: now
    })
    .where(and(base, gte(webhookEvents.attempts, maxAttempts)))
    .returning({ eventId: webhookEvents.eventId });
  return { recovered: recovered.length, deadLettered: deadLettered.length };
}

export async function claimNextEvent(
  db: BehalfPostgresDb,
  maxAttempts: number,
  now = new Date()
) {
  try {
    return await db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ eventId: webhookEvents.eventId })
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.status, "pending"),
            lte(webhookEvents.nextAttemptAt, now),
            lt(webhookEvents.attempts, maxAttempts),
            eq(webhookEvents.deadLetter, false)
          )
        )
        .orderBy(
          asc(webhookEvents.nextAttemptAt),
          asc(webhookEvents.createdAt),
          asc(webhookEvents.eventId)
        )
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return null;

      const [claimed] = await tx
        .update(webhookEvents)
        .set({
          status: "processing",
          processingStartedAt: now,
          attempts: sql`${webhookEvents.attempts} + 1`,
          updatedAt: now
        })
        .where(
          and(
            eq(webhookEvents.eventId, candidate.eventId),
            eq(webhookEvents.status, "pending"),
            lte(webhookEvents.nextAttemptAt, now),
            lt(webhookEvents.attempts, maxAttempts),
            eq(webhookEvents.deadLetter, false)
          )
        )
        .returning();
      return claimed ? normalizeWebhookEvent(claimed) : null;
    });
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function insertDeliveries(
  db: BehalfPostgresDb,
  deliveries: Array<Record<string, unknown>>
) {
  if (!deliveries.length) return [];
  try {
    const rows = await db
      .insert(webhookDeliveries)
      .values(deliveries as DeliveryInsert[])
      .returning();
    return rows.map(normalizeWebhookDelivery);
  } catch (error) {
    translatePostgresError(error);
  }
}

async function transitionEvent(
  db: BehalfPostgresDb,
  eventId: string,
  values: Partial<EventInsert>
) {
  const rows = await db
    .update(webhookEvents)
    .set({ ...values, processingStartedAt: null, updatedAt: new Date() })
    .where(and(eq(webhookEvents.eventId, eventId), eq(webhookEvents.status, "processing")))
    .returning({ eventId: webhookEvents.eventId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export function markEventCompleted(
  db: BehalfPostgresDb,
  eventId: string,
  now = new Date()
) {
  return transitionEvent(db, eventId, {
    status: "completed",
    deadLetter: false,
    lastError: null,
    completedAt: now,
    nextAttemptAt: now
  });
}

export function markEventFailed(
  db: BehalfPostgresDb,
  eventId: string,
  lastError: string,
  now = new Date()
) {
  return transitionEvent(db, eventId, {
    status: "failed",
    deadLetter: true,
    lastError,
    nextAttemptAt: now
  });
}

export function retryEvent(
  db: BehalfPostgresDb,
  eventId: string,
  nextAttemptAt: Date,
  lastError: string
) {
  return transitionEvent(db, eventId, {
    status: "pending",
    nextAttemptAt,
    lastError
  });
}

export async function listDeliveries(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {},
  options: WebhookListOptions = {}
) {
  let query = db
    .select()
    .from(webhookDeliveries)
    .where(buildWhere(deliveryColumns, filter))
    .$dynamic();
  query = query.orderBy(
    ...orderByFrom(deliveryColumns, options.sort ?? { createdAt: -1 }, "deliveryId")
  );
  if (options.skip !== undefined) query = query.offset(options.skip);
  if (options.limit !== undefined) query = query.limit(options.limit);
  return (await query).map((row) => project(normalizeWebhookDelivery(row), options.select));
}

async function deleteRows(
  db: BehalfPostgresDb,
  table: "deliveries" | "events" | "endpoints",
  filter: Record<string, unknown>
) {
  if (table === "deliveries") {
    const rows = await db
      .delete(webhookDeliveries)
      .where(buildWhere(deliveryColumns, filter))
      .returning({ id: webhookDeliveries.deliveryId });
    return { acknowledged: true, deletedCount: rows.length };
  }
  if (table === "events") {
    const rows = await db
      .delete(webhookEvents)
      .where(buildWhere(eventColumns, filter))
      .returning({ id: webhookEvents.eventId });
    return { acknowledged: true, deletedCount: rows.length };
  }
  const rows = await db
    .delete(webhookEndpoints)
    .where(buildWhere(endpointColumns, filter))
    .returning({ id: webhookEndpoints.webhookId });
  return { acknowledged: true, deletedCount: rows.length };
}

export const deleteDeliveries = (
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) => deleteRows(db, "deliveries", filter);
export const deleteEvents = (db: BehalfPostgresDb, filter: Record<string, unknown>) =>
  deleteRows(db, "events", filter);
export const deleteEndpoints = (
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) => deleteRows(db, "endpoints", filter);

export async function countWebhookEvents(
  db: BehalfPostgresDb,
  filter: Record<string, unknown> = {}
) {
  const [row] = await db
    .select({ value: count() })
    .from(webhookEvents)
    .where(buildWhere(eventColumns, filter));
  return row?.value ?? 0;
}

export async function findOneAndUpdateEndpoint(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(webhookEndpoints)
      .where(buildWhere(endpointColumns, filter))
      .limit(1)
      .for("update");
    if (!before) return null;
    const [after] = await tx
      .update(webhookEndpoints)
      .set(updateValues(endpointColumns, update, true))
      .where(eq(webhookEndpoints.webhookId, before.webhookId))
      .returning();
    const row = options.returnDocument === "after" || options.new === true ? after : before;
    return row ? projectEndpoint(normalizeWebhookEndpoint(row)) : null;
  });
}

export async function findOneAndUpdateEvent(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(webhookEvents)
      .where(buildWhere(eventColumns, filter))
      .limit(1)
      .for("update");
    if (!before) return null;
    const [after] = await tx
      .update(webhookEvents)
      .set(updateValues(eventColumns, update, true))
      .where(eq(webhookEvents.eventId, before.eventId))
      .returning();
    const row = options.returnDocument === "after" || options.new === true ? after : before;
    return row ? normalizeWebhookEvent(row) : null;
  });
}

export async function webhookEventExists(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) {
  const [row] = await db
    .select({ eventId: webhookEvents.eventId })
    .from(webhookEvents)
    .where(buildWhere(eventColumns, filter))
    .limit(1);
  return row ?? null;
}

export function createPostgresWebhookRepository(db: BehalfPostgresDb) {
  return {
    createEndpoint: (input: Record<string, unknown>) => createEndpoint(db, input),
    createEvent: (input: Record<string, unknown>) => createEvent(db, input),
    findEndpoint: (filter: Record<string, unknown>, select?: string) =>
      findEndpoint(db, filter, select),
    listEndpoints: (
      filter?: Record<string, unknown>,
      selectOrOptions?: string | WebhookListOptions
    ) => listEndpoints(db, filter, selectOrOptions),
    findActiveEndpointsForEvent: (event: {
      accountId: string;
      developerUserId?: string | null;
      type: string;
    }) => findActiveEndpointsForEvent(db, event),
    updateEndpoint: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
      updateEndpoint(db, filter, update),
    updateEndpoints: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
      updateEndpoints(db, filter, update),
    listEvents: (filter?: Record<string, unknown>, options?: WebhookListOptions) =>
      listEvents(db, filter, options),
    findEvent: (filter: Record<string, unknown>, select?: string) =>
      findEvent(db, filter, select),
    recoverStuckEvents: (stuckBefore: Date, maxAttempts: number) =>
      recoverStuckEvents(db, stuckBefore, maxAttempts),
    claimNextEvent: (maxAttempts: number, now?: Date) =>
      claimNextEvent(db, maxAttempts, now),
    insertDeliveries: (deliveries: Array<Record<string, unknown>>) =>
      insertDeliveries(db, deliveries),
    markEventCompleted: (eventId: string, now?: Date) =>
      markEventCompleted(db, eventId, now),
    markEventFailed: (eventId: string, lastError: string, now?: Date) =>
      markEventFailed(db, eventId, lastError, now),
    retryEvent: (eventId: string, nextAttemptAt: Date, lastError: string) =>
      retryEvent(db, eventId, nextAttemptAt, lastError),
    listDeliveries: (
      filter?: Record<string, unknown>,
      options?: WebhookListOptions
    ) => listDeliveries(db, filter, options),
    deleteDeliveries: (filter: Record<string, unknown>) =>
      deleteDeliveries(db, filter),
    deleteEvents: (filter: Record<string, unknown>) => deleteEvents(db, filter),
    deleteEndpoints: (filter: Record<string, unknown>) => deleteEndpoints(db, filter),
    countEvents: (filter?: Record<string, unknown>) => countWebhookEvents(db, filter),
    findOneAndUpdateEndpoint: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => findOneAndUpdateEndpoint(db, filter, update, options),
    findOneAndUpdateEvent: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => findOneAndUpdateEvent(db, filter, update, options),
    eventExists: (filter: Record<string, unknown>) => webhookEventExists(db, filter)
  };
}

export function createPostgresWebhookEndpointRepository(db: BehalfPostgresDb) {
  return {
    create: (input: Record<string, unknown>) => createEndpoint(db, input),
    find: (filter: Record<string, unknown> = {}, options?: WebhookListOptions) =>
      listEndpoints(db, filter, options),
    findOne: (filter: Record<string, unknown>, select?: string) =>
      findEndpoint(db, filter, select),
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => findOneAndUpdateEndpoint(db, filter, update, options),
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
      updateEndpoint(db, filter, update),
    updateMany: (filter: Record<string, unknown>, update: Record<string, unknown>) =>
      updateEndpoints(db, filter, update)
  };
}

export function createPostgresWebhookEventRepository(db: BehalfPostgresDb) {
  return {
    find: (filter: Record<string, unknown> = {}, options?: WebhookListOptions) =>
      listEvents(db, filter, options),
    findOne: (filter: Record<string, unknown>, select?: string) =>
      findEvent(db, filter, select),
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => findOneAndUpdateEvent(db, filter, update, options),
    exists: (filter: Record<string, unknown>) => webhookEventExists(db, filter)
  };
}

export function createPostgresWebhookDeliveryRepository(db: BehalfPostgresDb) {
  return {
    find: (filter: Record<string, unknown> = {}, options?: WebhookListOptions) =>
      listDeliveries(db, filter, options)
  };
}

export type PostgresWebhookRepository = ReturnType<
  typeof createPostgresWebhookRepository
>;
