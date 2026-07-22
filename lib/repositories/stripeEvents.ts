/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/stripeEvents";
import { delegate } from "@/lib/repositories/delegate";

export type {
  StripeWebhookEventLean,
  StripeEventRepository,
} from "@/lib/repositories/mongo/stripeEvents";

export {
  stripeEventRepository,
  stripeWebhookEventRepository,
} from "@/lib/repositories/mongo/stripeEvents";

export const createStripeEventIfAbsent = delegate("stripeEvents", "createStripeEventIfAbsent", mongo.createStripeEventIfAbsent);
export const findStripeEvent = delegate("stripeEvents", "findStripeEvent", mongo.findStripeEvent);
export const deleteStripeEvents = delegate("stripeEvents", "deleteStripeEvents", mongo.deleteStripeEvents);
