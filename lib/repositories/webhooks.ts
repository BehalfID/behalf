import WebhookDelivery from "@/models/WebhookDelivery";
import WebhookEndpoint from "@/models/WebhookEndpoint";
import WebhookEvent from "@/models/WebhookEvent";

export type WebhookEndpointRecord = {
  webhookId: string;
  accountId: string;
  developerUserId?: string | null;
  url: string;
  secretHash?: string;
  secretPreview: string;
  events: string[];
  status: string;
  lastTriggeredAt?: Date | null;
};

export type WebhookEventRecord = {
  eventId: string;
  accountId: string;
  developerUserId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  nextAttemptAt: Date;
  deadLetter: boolean;
  lastError?: string | null;
  completedAt?: Date | null;
};

export type WebhookDeliveryRecord = {
  deliveryId: string;
  accountId?: string | null;
  developerUserId?: string | null;
  webhookId: string;
  eventId: string;
  eventType: string;
  status: "success" | "failed";
  httpStatus?: number | null;
  error?: string | null;
  attempt: number;
  nextRetryAt?: Date | null;
  maxAttempts: number;
};

export async function createWebhookEndpoint(input: {
  webhookId: string;
  accountId: string;
  developerUserId?: string | null;
  url: string;
  secretHash: string;
  secretPreview: string;
  events: string[];
  status?: string;
}): Promise<WebhookEndpointRecord> {
  const doc = (await WebhookEndpoint.create({
    webhookId: input.webhookId,
    accountId: input.accountId,
    developerUserId: input.developerUserId ?? undefined,
    url: input.url,
    secretHash: input.secretHash,
    secretPreview: input.secretPreview,
    events: input.events,
    status: input.status ?? "active"
  })) as {
    webhookId: string;
    accountId: string;
    developerUserId?: string | null;
    url: string;
    secretPreview: string;
    events: string[];
    status: string;
    lastTriggeredAt?: Date | null;
  };

  return {
    webhookId: doc.webhookId,
    accountId: doc.accountId,
    developerUserId: doc.developerUserId ?? null,
    url: doc.url,
    secretPreview: doc.secretPreview,
    events: doc.events ?? [],
    status: doc.status,
    lastTriggeredAt: doc.lastTriggeredAt ?? null
  };
}

export async function findActiveWebhookEndpointsForEvent(input: {
  accountId?: string | null;
  developerUserId?: string | null;
  eventType: string;
}): Promise<WebhookEndpointRecord[]> {
  const scope = input.developerUserId
    ? { developerUserId: input.developerUserId }
    : { accountId: input.accountId };
  const query = WebhookEndpoint.find({
    ...scope,
    status: "active",
    events: input.eventType
  }).select("+secretHash");
  const rows =
    typeof (query as { lean?: () => Promise<Record<string, unknown>[]> }).lean === "function"
      ? await (query as { lean: () => Promise<Record<string, unknown>[]> }).lean()
      : ((await query) as Record<string, unknown>[]);

  return rows.map((row) => ({
    webhookId: row.webhookId as string,
    accountId: row.accountId as string,
    developerUserId: (row.developerUserId as string | null | undefined) ?? null,
    url: row.url as string,
    secretHash: row.secretHash as string | undefined,
    secretPreview: row.secretPreview as string,
    events: (row.events as string[] | undefined) ?? [],
    status: row.status as string,
    lastTriggeredAt: (row.lastTriggeredAt as Date | null | undefined) ?? null
  }));
}

export async function findWebhookEndpointById(
  webhookId: string,
  scope: { accountId?: string; developerUserId?: string }
): Promise<WebhookEndpointRecord | null> {
  const row = await WebhookEndpoint.findOne({ webhookId, ...scope }).lean();
  if (!row) return null;
  return {
    webhookId: row.webhookId as string,
    accountId: row.accountId as string,
    developerUserId: (row.developerUserId as string | null | undefined) ?? null,
    url: row.url as string,
    secretPreview: row.secretPreview as string,
    events: (row.events as string[] | undefined) ?? [],
    status: row.status as string,
    lastTriggeredAt: (row.lastTriggeredAt as Date | null | undefined) ?? null
  };
}

export async function updateWebhookEndpointStatus(
  webhookId: string,
  accountId: string,
  status: "active" | "disabled"
) {
  return WebhookEndpoint.updateOne({ webhookId, accountId }, { $set: { status } });
}

export async function touchWebhookEndpointsLastTriggered(
  webhookIds: string[],
  scope: { accountId?: string | null; developerUserId?: string | null },
  lastTriggeredAt = new Date()
) {
  if (webhookIds.length === 0) return { matchedCount: 0, modifiedCount: 0 };
  const filter = scope.developerUserId
    ? { developerUserId: scope.developerUserId, webhookId: { $in: webhookIds } }
    : { accountId: scope.accountId, webhookId: { $in: webhookIds } };
  return WebhookEndpoint.updateMany(filter, { $set: { lastTriggeredAt } });
}

export async function enqueueWebhookEventRecord(input: {
  eventId: string;
  accountId: string;
  developerUserId?: string | null;
  type: string;
  payload: Record<string, unknown>;
}): Promise<WebhookEventRecord> {
  const doc = (await WebhookEvent.create({
    eventId: input.eventId,
    accountId: input.accountId,
    developerUserId: input.developerUserId ?? undefined,
    type: input.type,
    payload: input.payload,
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date(),
    deadLetter: false,
    lastError: null,
    completedAt: null
  })) as {
    eventId: string;
    accountId: string;
    developerUserId?: string | null;
    type: string;
    payload: Record<string, unknown>;
    status: string;
    attempts: number;
    nextAttemptAt: Date;
    deadLetter: boolean;
    lastError?: string | null;
    completedAt?: Date | null;
  };

  return {
    eventId: doc.eventId,
    accountId: doc.accountId,
    developerUserId: doc.developerUserId ?? null,
    type: doc.type,
    payload: doc.payload,
    status: doc.status,
    attempts: doc.attempts,
    nextAttemptAt: doc.nextAttemptAt,
    deadLetter: doc.deadLetter,
    lastError: doc.lastError ?? null,
    completedAt: doc.completedAt ?? null
  };
}

export async function claimNextWebhookEvent(
  now = new Date(),
  maxAttempts = 5
): Promise<WebhookEventRecord | null> {
  const row = await WebhookEvent.findOneAndUpdate(
    {
      status: "pending",
      nextAttemptAt: { $lte: now },
      attempts: { $lt: maxAttempts },
      deadLetter: false
    },
    {
      $set: { status: "processing", processingStartedAt: now },
      $inc: { attempts: 1 }
    },
    {
      sort: { nextAttemptAt: 1, createdAt: 1 },
      returnDocument: "after"
    }
  );

  if (!row) return null;
  const plain =
    typeof (row as { toObject?: () => Record<string, unknown> }).toObject === "function"
      ? (row as { toObject: () => Record<string, unknown> }).toObject()
      : (row as Record<string, unknown>);

  return {
    eventId: plain.eventId as string,
    accountId: plain.accountId as string,
    developerUserId: (plain.developerUserId as string | null | undefined) ?? null,
    type: plain.type as string,
    payload: (plain.payload as Record<string, unknown>) ?? {},
    status: plain.status as string,
    attempts: plain.attempts as number,
    nextAttemptAt: plain.nextAttemptAt as Date,
    deadLetter: Boolean(plain.deadLetter),
    lastError: (plain.lastError as string | null | undefined) ?? null,
    completedAt: (plain.completedAt as Date | null | undefined) ?? null
  };
}

export async function markWebhookEventCompleted(eventId: string, completedAt = new Date()) {
  return WebhookEvent.updateOne(
    { eventId, status: "processing" },
    {
      $set: {
        status: "completed",
        deadLetter: false,
        lastError: null,
        completedAt,
        nextAttemptAt: completedAt
      },
      $unset: { processingStartedAt: "" }
    }
  );
}

export async function markWebhookEventForRetry(
  eventId: string,
  nextAttemptAt: Date,
  lastError?: string | null
) {
  return WebhookEvent.updateOne(
    { eventId, status: "processing" },
    {
      $set: { status: "pending", nextAttemptAt, lastError: lastError ?? null },
      $unset: { processingStartedAt: "" }
    }
  );
}

export async function markWebhookEventDeadLetter(eventId: string, lastError: string) {
  return WebhookEvent.updateOne(
    { eventId, status: "processing" },
    {
      $set: {
        status: "failed",
        deadLetter: true,
        lastError,
        nextAttemptAt: new Date()
      },
      $unset: { processingStartedAt: "" }
    }
  );
}

export async function countPendingWebhookEvents(scope: {
  accountId?: string;
  developerUserId?: string;
}) {
  return WebhookEvent.countDocuments({ ...scope, status: "pending" });
}

export async function countDeadLetterWebhookEvents(scope: {
  accountId?: string;
  developerUserId?: string;
}) {
  return WebhookEvent.countDocuments({ ...scope, deadLetter: true });
}

export async function insertWebhookDeliveries(rows: WebhookDeliveryRecord[]) {
  if (rows.length === 0) return [];
  await WebhookDelivery.insertMany(rows);
  return rows;
}

export async function findWebhookDeliveriesByWebhook(
  webhookId: string,
  scope: { accountId?: string; developerUserId?: string },
  options?: { limit?: number }
): Promise<WebhookDeliveryRecord[]> {
  const query = WebhookDelivery.find({ webhookId, ...scope }).sort({ createdAt: -1 });
  if (options?.limit) query.limit(options.limit);
  const rows = await query.lean();
  return rows.map((row) => ({
    deliveryId: row.deliveryId as string,
    accountId: (row.accountId as string | null | undefined) ?? null,
    developerUserId: (row.developerUserId as string | null | undefined) ?? null,
    webhookId: row.webhookId as string,
    eventId: row.eventId as string,
    eventType: row.eventType as string,
    status: row.status as "success" | "failed",
    httpStatus: (row.httpStatus as number | null | undefined) ?? null,
    error: (row.error as string | null | undefined) ?? null,
    attempt: row.attempt as number,
    nextRetryAt: (row.nextRetryAt as Date | null | undefined) ?? null,
    maxAttempts: row.maxAttempts as number
  }));
}
