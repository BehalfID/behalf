/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/webhooks";
import { delegate } from "@/lib/repositories/delegate";

export type {
  WebhookEndpointLean,
  WebhookEventLean,
  WebhookDeliveryLean,
  WebhookRepository,
} from "@/lib/repositories/mongo/webhooks";

export {
  webhookRepository,
  webhookEndpointRepository,
  webhookEventRepository,
  webhookDeliveryRepository,
  endpointModel,
  eventModel,
  deliveryModel,
} from "@/lib/repositories/mongo/webhooks";

export const createEndpoint = delegate("webhooks", "createEndpoint", mongo.createEndpoint);
export const createEvent = delegate("webhooks", "createEvent", mongo.createEvent);
export const findEndpoint = delegate("webhooks", "findEndpoint", mongo.findEndpoint);
export const listEndpoints = delegate("webhooks", "listEndpoints", mongo.listEndpoints);
export const findActiveEndpointsForEvent = delegate("webhooks", "findActiveEndpointsForEvent", mongo.findActiveEndpointsForEvent);
export const updateEndpoint = delegate("webhooks", "updateEndpoint", mongo.updateEndpoint);
export const updateEndpoints = delegate("webhooks", "updateEndpoints", mongo.updateEndpoints);
export const listEvents = delegate("webhooks", "listEvents", mongo.listEvents);
export const findEvent = delegate("webhooks", "findEvent", mongo.findEvent);
export const recoverStuckEvents = delegate("webhooks", "recoverStuckEvents", mongo.recoverStuckEvents);
export const claimNextEvent = delegate("webhooks", "claimNextEvent", mongo.claimNextEvent);
export const insertDeliveries = delegate("webhooks", "insertDeliveries", mongo.insertDeliveries);
export const markEventCompleted = delegate("webhooks", "markEventCompleted", mongo.markEventCompleted);
export const markEventFailed = delegate("webhooks", "markEventFailed", mongo.markEventFailed);
export const retryEvent = delegate("webhooks", "retryEvent", mongo.retryEvent);
export const listDeliveries = delegate("webhooks", "listDeliveries", mongo.listDeliveries);
export const deleteDeliveries = delegate("webhooks", "deleteDeliveries", mongo.deleteDeliveries);
export const deleteEvents = delegate("webhooks", "deleteEvents", mongo.deleteEvents);
export const deleteEndpoints = delegate("webhooks", "deleteEndpoints", mongo.deleteEndpoints);
export const countWebhookEvents = delegate("webhooks", "countWebhookEvents", mongo.countWebhookEvents);
export const findOneAndUpdateEndpoint = delegate("webhooks", "findOneAndUpdateEndpoint", mongo.findOneAndUpdateEndpoint);
export const findOneAndUpdateEvent = delegate("webhooks", "findOneAndUpdateEvent", mongo.findOneAndUpdateEvent);
export const webhookEventExists = delegate("webhooks", "webhookEventExists", mongo.webhookEventExists);
