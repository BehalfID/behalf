import StripeWebhookEvent, { type StripeWebhookEventDocument } from "@/models/StripeWebhookEvent";
import { isMongoDuplicateKeyError } from "@/lib/repositories/errors";

export type StripeWebhookEventLean = StripeWebhookEventDocument;
export type StripeEventRepository = typeof stripeEventRepository;

/**
 * Returns false when an event was already processed. The insert remains the
 * idempotency boundary; callers must not replace it with a read-then-write.
 */
export async function createStripeEventIfAbsent(
  eventId: string,
  type: string,
  processedAt = new Date()
): Promise<boolean> {
  try {
    await StripeWebhookEvent.create({ eventId, type, processedAt });
    return true;
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) return false;
    throw error;
  }
}

export async function findStripeEvent(eventId: string) {
  return StripeWebhookEvent.findOne({ eventId });
}

export async function deleteStripeEvents(filter: Record<string, unknown>) {
  return StripeWebhookEvent.deleteMany(filter);
}

export const stripeEventRepository = {
  createIfAbsent: createStripeEventIfAbsent,
  findOne: findStripeEvent,
  deleteMany: deleteStripeEvents
};

export const stripeWebhookEventRepository = { create: (input: Partial<StripeWebhookEventDocument>) => StripeWebhookEvent.create(input) };
