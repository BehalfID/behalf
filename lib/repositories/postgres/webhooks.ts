/**
 * Test-only Postgres webhook adapters — not exported from lib/repositories/index.ts.
 */

import { and, arrayContains, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import {
  webhookDeliveries,
  webhookEndpoints,
  webhookEvents
} from "@/lib/db/postgres/schema";
import type {
  WebhookDeliveryRecord,
  WebhookEndpointRecord,
  WebhookEventRecord
} from "@/lib/repositories/webhooks";

function toEndpointRecord(
  row: typeof webhookEndpoints.$inferSelect,
  includeSecret = false
): WebhookEndpointRecord {
  return {
    webhookId: row.webhookId,
    accountId: row.accountId,
    developerUserId: row.developerUserId ?? null,
    url: row.url,
    secretHash: includeSecret ? row.secretHash : undefined,
    secretPreview: row.secretPreview,
    events: row.events ?? [],
    status: row.status,
    lastTriggeredAt: row.lastTriggeredAt ?? null
  };
}

function toEventRecord(row: typeof webhookEvents.$inferSelect): WebhookEventRecord {
  return {
    eventId: row.eventId,
    accountId: row.accountId,
    developerUserId: row.developerUserId ?? null,
    type: row.type,
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    deadLetter: row.deadLetter,
    lastError: row.lastError ?? null,
    completedAt: row.completedAt ?? null
  };
}

function toDeliveryRecord(row: typeof webhookDeliveries.$inferSelect): WebhookDeliveryRecord {
  return {
    deliveryId: row.deliveryId,
    accountId: row.accountId ?? null,
    developerUserId: row.developerUserId ?? null,
    webhookId: row.webhookId,
    eventId: row.eventId,
    eventType: row.eventType,
    status: row.status as "success" | "failed",
    httpStatus: row.httpStatus ?? null,
    error: row.error ?? null,
    attempt: row.attempt,
    nextRetryAt: row.nextRetryAt ?? null,
    maxAttempts: row.maxAttempts
  };
}

export async function createWebhookEndpoint(
  db: BehalfPostgresDb,
  input: {
    webhookId: string;
    accountId: string;
    developerUserId?: string | null;
    url: string;
    secretHash: string;
    secretPreview: string;
    events: string[];
    status?: string;
  }
): Promise<WebhookEndpointRecord> {
  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      webhookId: input.webhookId,
      accountId: input.accountId,
      developerUserId: input.developerUserId ?? null,
      url: input.url,
      secretHash: input.secretHash,
      secretPreview: input.secretPreview,
      events: input.events,
      status: input.status ?? "active"
    })
    .returning();
  if (!row) throw new Error("Failed to create webhook endpoint");
  return toEndpointRecord(row);
}

export async function findActiveWebhookEndpointsForEvent(
  db: BehalfPostgresDb,
  input: {
    accountId?: string | null;
    developerUserId?: string | null;
    eventType: string;
  }
): Promise<WebhookEndpointRecord[]> {
  const scope = input.developerUserId
    ? eq(webhookEndpoints.developerUserId, input.developerUserId)
    : eq(webhookEndpoints.accountId, input.accountId!);

  const rows = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        scope,
        eq(webhookEndpoints.status, "active"),
        arrayContains(webhookEndpoints.events, [input.eventType])
      )
    );

  return rows.map((row) => toEndpointRecord(row, true));
}

export async function findWebhookEndpointById(
  db: BehalfPostgresDb,
  webhookId: string,
  scope: { accountId?: string; developerUserId?: string }
): Promise<WebhookEndpointRecord | null> {
  const filters = [eq(webhookEndpoints.webhookId, webhookId)];
  if (scope.accountId) filters.push(eq(webhookEndpoints.accountId, scope.accountId));
  if (scope.developerUserId) {
    filters.push(eq(webhookEndpoints.developerUserId, scope.developerUserId));
  }
  const row =
    (await db.query.webhookEndpoints.findFirst({
      where: and(...filters)
    })) ?? null;
  return row ? toEndpointRecord(row) : null;
}

export async function updateWebhookEndpointStatus(
  db: BehalfPostgresDb,
  webhookId: string,
  accountId: string,
  status: "active" | "disabled"
) {
  return db
    .update(webhookEndpoints)
    .set({ status })
    .where(and(eq(webhookEndpoints.webhookId, webhookId), eq(webhookEndpoints.accountId, accountId)));
}

export async function touchWebhookEndpointsLastTriggered(
  db: BehalfPostgresDb,
  webhookIds: string[],
  scope: { accountId?: string | null; developerUserId?: string | null },
  lastTriggeredAt = new Date()
) {
  if (webhookIds.length === 0) return;
  const scopeFilter = scope.developerUserId
    ? eq(webhookEndpoints.developerUserId, scope.developerUserId)
    : eq(webhookEndpoints.accountId, scope.accountId!);
  return db
    .update(webhookEndpoints)
    .set({ lastTriggeredAt })
    .where(and(scopeFilter, inArray(webhookEndpoints.webhookId, webhookIds)));
}

export async function enqueueWebhookEventRecord(
  db: BehalfPostgresDb,
  input: {
    eventId: string;
    accountId: string;
    developerUserId?: string | null;
    type: string;
    payload: Record<string, unknown>;
  }
): Promise<WebhookEventRecord> {
  const [row] = await db
    .insert(webhookEvents)
    .values({
      eventId: input.eventId,
      accountId: input.accountId,
      developerUserId: input.developerUserId ?? null,
      type: input.type,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
      deadLetter: false,
      lastError: null,
      completedAt: null
    })
    .returning();
  if (!row) throw new Error("Failed to enqueue webhook event");
  return toEventRecord(row);
}

export async function claimNextWebhookEvent(
  db: BehalfPostgresDb,
  now = new Date(),
  maxAttempts = 5
): Promise<WebhookEventRecord | null> {
  const claimed = await db.execute(sql`
    WITH next_event AS (
      SELECT event_id
      FROM webhook_events
      WHERE status = 'pending'
        AND next_attempt_at <= ${now}
        AND attempts < ${maxAttempts}
        AND dead_letter = false
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE webhook_events AS e
    SET
      status = 'processing',
      processing_started_at = ${now},
      attempts = e.attempts + 1
    FROM next_event
    WHERE e.event_id = next_event.event_id
    RETURNING e.*;
  `);

  const rows =
    (claimed as unknown as { rows?: Array<Record<string, unknown>> }).rows ??
    (Array.isArray(claimed) ? (claimed as Array<Record<string, unknown>>) : []);
  const row = rows[0];
  if (!row) return null;

  return {
    eventId: String(row.event_id),
    accountId: String(row.account_id),
    developerUserId: (row.developer_user_id as string | null | undefined) ?? null,
    type: String(row.type),
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: String(row.status),
    attempts: Number(row.attempts),
    nextAttemptAt: new Date(row.next_attempt_at as string | Date),
    deadLetter: Boolean(row.dead_letter),
    lastError: (row.last_error as string | null | undefined) ?? null,
    completedAt: row.completed_at ? new Date(row.completed_at as string | Date) : null
  };
}

export async function markWebhookEventCompleted(
  db: BehalfPostgresDb,
  eventId: string,
  completedAt = new Date()
) {
  return db
    .update(webhookEvents)
    .set({
      status: "completed",
      deadLetter: false,
      lastError: null,
      completedAt,
      nextAttemptAt: completedAt,
      processingStartedAt: null
    })
    .where(and(eq(webhookEvents.eventId, eventId), eq(webhookEvents.status, "processing")));
}

export async function markWebhookEventForRetry(
  db: BehalfPostgresDb,
  eventId: string,
  nextAttemptAt: Date,
  lastError?: string | null
) {
  return db
    .update(webhookEvents)
    .set({
      status: "pending",
      nextAttemptAt,
      lastError: lastError ?? null,
      processingStartedAt: null
    })
    .where(and(eq(webhookEvents.eventId, eventId), eq(webhookEvents.status, "processing")));
}

export async function markWebhookEventDeadLetter(
  db: BehalfPostgresDb,
  eventId: string,
  lastError: string
) {
  return db
    .update(webhookEvents)
    .set({
      status: "failed",
      deadLetter: true,
      lastError,
      nextAttemptAt: new Date(),
      processingStartedAt: null
    })
    .where(and(eq(webhookEvents.eventId, eventId), eq(webhookEvents.status, "processing")));
}

export async function countPendingWebhookEvents(
  db: BehalfPostgresDb,
  scope: { accountId?: string; developerUserId?: string }
) {
  const filter = scope.developerUserId
    ? and(eq(webhookEvents.developerUserId, scope.developerUserId), eq(webhookEvents.status, "pending"))
    : and(eq(webhookEvents.accountId, scope.accountId!), eq(webhookEvents.status, "pending"));
  const [row] = await db.select({ value: count() }).from(webhookEvents).where(filter);
  return row?.value ?? 0;
}

export async function countDeadLetterWebhookEvents(
  db: BehalfPostgresDb,
  scope: { accountId?: string; developerUserId?: string }
) {
  const filter = scope.developerUserId
    ? and(
        eq(webhookEvents.developerUserId, scope.developerUserId),
        eq(webhookEvents.deadLetter, true)
      )
    : and(eq(webhookEvents.accountId, scope.accountId!), eq(webhookEvents.deadLetter, true));
  const [row] = await db.select({ value: count() }).from(webhookEvents).where(filter);
  return row?.value ?? 0;
}

export async function insertWebhookDeliveries(db: BehalfPostgresDb, rows: WebhookDeliveryRecord[]) {
  if (rows.length === 0) return [];
  const inserted = await db
    .insert(webhookDeliveries)
    .values(
      rows.map((row) => ({
        deliveryId: row.deliveryId,
        accountId: row.accountId ?? null,
        developerUserId: row.developerUserId ?? null,
        webhookId: row.webhookId,
        eventId: row.eventId,
        eventType: row.eventType,
        status: row.status,
        httpStatus: row.httpStatus ?? null,
        error: row.error ?? null,
        attempt: row.attempt,
        nextRetryAt: row.nextRetryAt ?? null,
        maxAttempts: row.maxAttempts
      }))
    )
    .returning();
  return inserted.map(toDeliveryRecord);
}

export async function findWebhookDeliveriesByWebhook(
  db: BehalfPostgresDb,
  webhookId: string,
  scope: { accountId?: string; developerUserId?: string },
  options?: { limit?: number }
): Promise<WebhookDeliveryRecord[]> {
  const filters = [eq(webhookDeliveries.webhookId, webhookId)];
  if (scope.accountId) filters.push(eq(webhookDeliveries.accountId, scope.accountId));
  if (scope.developerUserId) {
    filters.push(eq(webhookDeliveries.developerUserId, scope.developerUserId));
  }

  const query = db
    .select()
    .from(webhookDeliveries)
    .where(and(...filters))
    .orderBy(desc(webhookDeliveries.createdAt));
  const rows = options?.limit ? await query.limit(options.limit) : await query;
  return rows.map(toDeliveryRecord);
}
