import { eq } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { stripeWebhookEvents } from "@/lib/db/postgres/schema";
import {
  DuplicateKeyError,
  postgresErrorCode,
  translatePostgresError
} from "@/lib/repositories/errors";

type StripeEventRow = typeof stripeWebhookEvents.$inferSelect;

export type StripeWebhookEventDomain = StripeEventRow;

/**
 * Returns false when an event was already processed. The insert remains the
 * idempotency boundary; callers must not replace it with a read-then-write.
 */
export async function createStripeEventIfAbsent(
  db: BehalfPostgresDb,
  eventId: string,
  type: string,
  processedAt = new Date()
): Promise<boolean> {
  try {
    await db.insert(stripeWebhookEvents).values({ eventId, type, processedAt });
    return true;
  } catch (error) {
    if (postgresErrorCode(error) === "23505") return false;
    try {
      translatePostgresError(error);
    } catch (translated) {
      if (translated instanceof DuplicateKeyError) return false;
      throw translated;
    }
  }
}

export async function findStripeEvent(db: BehalfPostgresDb, eventId: string) {
  return (
    (await db.query.stripeWebhookEvents.findFirst({
      where: eq(stripeWebhookEvents.eventId, eventId)
    })) ?? null
  );
}

export async function deleteStripeEvents(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>
) {
  if (typeof filter.eventId === "string") {
    const rows = await db
      .delete(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, filter.eventId))
      .returning({ eventId: stripeWebhookEvents.eventId });
    return { acknowledged: true, deletedCount: rows.length };
  }

  if (Object.keys(filter).length === 0) {
    const rows = await db
      .delete(stripeWebhookEvents)
      .returning({ eventId: stripeWebhookEvents.eventId });
    return { acknowledged: true, deletedCount: rows.length };
  }

  throw new Error("Unsupported stripe event delete filter");
}

export function createPostgresStripeEventRepository(db: BehalfPostgresDb) {
  return {
    createIfAbsent: (eventId: string, type: string, processedAt?: Date) =>
      createStripeEventIfAbsent(db, eventId, type, processedAt),
    findOne: (eventId: string) => findStripeEvent(db, eventId),
    deleteMany: (filter: Record<string, unknown>) => deleteStripeEvents(db, filter)
  };
}

export type PostgresStripeEventRepository = ReturnType<
  typeof createPostgresStripeEventRepository
>;
