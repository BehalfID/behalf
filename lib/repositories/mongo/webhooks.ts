import WebhookDelivery, { type WebhookDeliveryDocument } from "@/models/WebhookDelivery";
import WebhookEndpoint, { type WebhookEndpointDocument } from "@/models/WebhookEndpoint";
import WebhookEvent, { type WebhookEventDocument } from "@/models/WebhookEvent";
import { lazyModelAdapter } from "@/lib/repositories/mongoModelAdapter";

export type WebhookEndpointLean = WebhookEndpointDocument;
export type WebhookEventLean = WebhookEventDocument;
export type WebhookDeliveryLean = WebhookDeliveryDocument;
export type WebhookRepository = typeof webhookRepository;

export async function createEndpoint(input: Partial<WebhookEndpointDocument>) {
  return WebhookEndpoint.create(input);
}

export async function createEvent(input: Partial<WebhookEventDocument>) {
  return WebhookEvent.create(input);
}

export function findEndpoint(filter: Record<string, unknown>, select?: string) {
  const query = WebhookEndpoint.findOne(filter);
  if (select) query.select(select);
  return query;
}

export function listEndpoints(filter: Record<string, unknown>, select?: string) {
  const query = WebhookEndpoint.find(filter);
  if (select) query.select(select);
  return query;
}

export function findActiveEndpointsForEvent(
  event: Pick<WebhookEventDocument, "accountId" | "developerUserId" | "type">
) {
  return WebhookEndpoint.find({
    ...(event.developerUserId
      ? { developerUserId: event.developerUserId }
      : { accountId: event.accountId }),
    status: "active",
    events: event.type
  }).select("+secretHash");
}

export async function updateEndpoint(filter: Record<string, unknown>, update: Record<string, unknown>) {
  return WebhookEndpoint.updateOne(filter, update);
}

export async function updateEndpoints(filter: Record<string, unknown>, update: Record<string, unknown>) {
  return WebhookEndpoint.updateMany(filter, update);
}

export function listEvents(
  filter: Record<string, unknown>,
  options: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number; select?: string } = {}
) {
  const query = WebhookEvent.find(filter).sort(options.sort ?? { createdAt: -1, eventId: -1 });
  if (options.select) query.select(options.select);
  if (options.skip) query.skip(options.skip);
  if (options.limit) query.limit(options.limit);
  return query;
}

export function findEvent(filter: Record<string, unknown>) {
  return WebhookEvent.findOne(filter);
}

export async function recoverStuckEvents(stuckBefore: Date, maxAttempts: number) {
  const stuckQuery = {
    status: "processing",
    processingStartedAt: { $lte: stuckBefore },
    deadLetter: false
  } as const;
  const now = new Date();
  const recovered = await WebhookEvent.updateMany(
    { ...stuckQuery, attempts: { $lt: maxAttempts } },
    { $set: { status: "pending", nextAttemptAt: now }, $unset: { processingStartedAt: "" } }
  );
  const deadLettered = await WebhookEvent.updateMany(
    { ...stuckQuery, attempts: { $gte: maxAttempts } },
    {
      $set: {
        status: "failed",
        deadLetter: true,
        lastError: "Webhook delivery timed out while processing and reached maximum attempts.",
        nextAttemptAt: now
      },
      $unset: { processingStartedAt: "" }
    }
  );
  return { recovered: recovered.modifiedCount ?? 0, deadLettered: deadLettered.modifiedCount ?? 0 };
}

export async function claimNextEvent(maxAttempts: number, now = new Date()) {
  return WebhookEvent.findOneAndUpdate(
    {
      status: "pending",
      nextAttemptAt: { $lte: now },
      attempts: { $lt: maxAttempts },
      deadLetter: false
    },
    { $set: { status: "processing", processingStartedAt: now }, $inc: { attempts: 1 } },
    { sort: { nextAttemptAt: 1, createdAt: 1, eventId: 1 }, returnDocument: "after" }
  );
}

export async function insertDeliveries(deliveries: Array<Partial<WebhookDeliveryDocument>>) {
  return WebhookDelivery.insertMany(deliveries);
}

export async function markEventCompleted(eventId: string, now = new Date()) {
  return WebhookEvent.updateOne(
    { eventId, status: "processing" },
    {
      $set: { status: "completed", deadLetter: false, lastError: null, completedAt: now, nextAttemptAt: now },
      $unset: { processingStartedAt: "" }
    }
  );
}

export async function markEventFailed(eventId: string, lastError: string, now = new Date()) {
  return WebhookEvent.updateOne(
    { eventId, status: "processing" },
    {
      $set: { status: "failed", deadLetter: true, lastError, nextAttemptAt: now },
      $unset: { processingStartedAt: "" }
    }
  );
}

export async function retryEvent(eventId: string, nextAttemptAt: Date, lastError: string) {
  return WebhookEvent.updateOne(
    { eventId, status: "processing" },
    { $set: { status: "pending", nextAttemptAt, lastError }, $unset: { processingStartedAt: "" } }
  );
}

export function listDeliveries(filter: Record<string, unknown>) {
  return WebhookDelivery.find(filter).sort({ createdAt: -1, deliveryId: -1 });
}

export async function deleteDeliveries(filter: Record<string, unknown>) {
  return WebhookDelivery.deleteMany(filter);
}

export async function deleteEvents(filter: Record<string, unknown>) {
  return WebhookEvent.deleteMany(filter);
}

export async function deleteEndpoints(filter: Record<string, unknown>) {
  return WebhookEndpoint.deleteMany(filter);
}

export async function countWebhookEvents(filter: Record<string, unknown>) {
  return WebhookEvent.countDocuments(filter);
}

export function findOneAndUpdateEndpoint(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options?: Record<string, unknown>
) {
  return WebhookEndpoint.findOneAndUpdate(filter, update, options);
}

export function findOneAndUpdateEvent(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options?: Record<string, unknown>
) {
  return WebhookEvent.findOneAndUpdate(filter, update, options);
}

export function webhookEventExists(filter: Record<string, unknown>) {
  return WebhookEvent.exists(filter);
}

export const webhookRepository = {
  createEndpoint,
  createEvent,
  findEndpoint,
  listEndpoints,
  findActiveEndpointsForEvent,
  updateEndpoint,
  updateEndpoints,
  listEvents,
  findEvent,
  recoverStuckEvents,
  claimNextEvent,
  insertDeliveries,
  markEventCompleted,
  markEventFailed,
  retryEvent,
  listDeliveries,
  deleteDeliveries,
  deleteEvents,
  deleteEndpoints,
  countEvents: countWebhookEvents
};

export const webhookEndpointRepository = {
  create: createEndpoint,
  find: (filter: Record<string, unknown> = {}) => WebhookEndpoint.find(filter),
  findOne: findEndpoint,
  findOneAndUpdate: findOneAndUpdateEndpoint,
  updateOne: updateEndpoint,
  updateMany: updateEndpoints
};

export const webhookEventRepository = {
  find: (filter: Record<string, unknown> = {}) => WebhookEvent.find(filter),
  findOne: findEvent,
  findOneAndUpdate: findOneAndUpdateEvent,
  exists: webhookEventExists
};

export const webhookDeliveryRepository = {
  find: (filter: Record<string, unknown> = {}) => WebhookDelivery.find(filter)
};

export const endpointModel = lazyModelAdapter(() => WebhookEndpoint);
export const eventModel = lazyModelAdapter(() => WebhookEvent);
export const deliveryModel = lazyModelAdapter(() => WebhookDelivery);
