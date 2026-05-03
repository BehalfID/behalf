import { connectToDatabase } from "@/lib/db";
import { createPublicId } from "@/lib/ids";
import {
  signWebhookPayload,
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_MAX_ATTEMPTS,
  type WebhookEvent
} from "@/lib/webhooks";
import WebhookDelivery from "@/models/WebhookDelivery";
import WebhookEndpoint from "@/models/WebhookEndpoint";
import WebhookEventModel, { type WebhookEventDocument } from "@/models/WebhookEvent";

const DEFAULT_BATCH_SIZE = 10;
const STUCK_PROCESSING_MS = 5 * 60 * 1000;
const DELIVERY_TIMEOUT_MS = 5_000;

type ProcessSummary = {
  processed: number;
  completed: number;
  retried: number;
  failed: number;
};

type DeliveryResult = {
  webhookId: string;
  status: "success" | "failed";
  httpStatus?: number;
  error?: string;
};

export async function processWebhookEvents(limit = DEFAULT_BATCH_SIZE): Promise<ProcessSummary> {
  await connectToDatabase();
  await recoverStuckEvents();

  const summary: ProcessSummary = {
    processed: 0,
    completed: 0,
    retried: 0,
    failed: 0
  };

  for (let index = 0; index < limit; index += 1) {
    const event = await claimNextEvent();
    if (!event) {
      break;
    }

    summary.processed += 1;
    const result = await processClaimedEvent(event);
    summary[result] += 1;
  }

  return summary;
}

async function recoverStuckEvents() {
  const stuckBefore = new Date(Date.now() - STUCK_PROCESSING_MS);
  const stuckQuery = {
    status: "processing",
    processingStartedAt: { $lte: stuckBefore },
    deadLetter: false
  } as const;

  await WebhookEventModel.updateMany(
    {
      ...stuckQuery,
      attempts: { $lt: WEBHOOK_MAX_ATTEMPTS },
    },
    {
      $set: { status: "pending", nextAttemptAt: new Date() },
      $unset: { processingStartedAt: "" }
    }
  );

  await WebhookEventModel.updateMany(
    {
      ...stuckQuery,
      attempts: { $gte: WEBHOOK_MAX_ATTEMPTS }
    },
    {
      $set: {
        status: "failed",
        deadLetter: true,
        lastError: "Webhook delivery timed out while processing and reached maximum attempts.",
        nextAttemptAt: new Date()
      },
      $unset: { processingStartedAt: "" }
    }
  );
}

async function claimNextEvent() {
  const now = new Date();
  return WebhookEventModel.findOneAndUpdate(
    {
      status: "pending",
      nextAttemptAt: { $lte: now },
      attempts: { $lt: WEBHOOK_MAX_ATTEMPTS },
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
}

async function processClaimedEvent(event: WebhookEventDocument) {
  const payload = event.payload as WebhookEvent;
  const attempt = event.attempts;
  const endpoints = await WebhookEndpoint.find({
    ...(event.developerUserId
      ? { developerUserId: event.developerUserId }
      : { accountId: event.accountId }),
    status: "active",
    events: event.type
  }).select("+secretHash");

  if (!endpoints.length) {
    await markEventCompleted(event.eventId);
    return "completed" as const;
  }

  const rawBody = JSON.stringify(payload);
  const results = await Promise.all(
    endpoints.map((endpoint) =>
      deliverToEndpoint({
        url: endpoint.url,
        secretHash: endpoint.secretHash,
        webhookId: endpoint.webhookId,
        eventId: event.eventId,
        rawBody
      })
    )
  );

  const failed = results.some((result) => result.status === "failed");
  const nextRetryAt = failed && attempt < WEBHOOK_MAX_ATTEMPTS ? nextAttemptAt(attempt) : undefined;
  const lastError = summarizeDeliveryErrors(results);

  await WebhookDelivery.insertMany(
    results.map((result) => ({
      deliveryId: createPublicId("dlv"),
      accountId: event.accountId,
      developerUserId: event.developerUserId,
      webhookId: result.webhookId,
      eventId: event.eventId,
      eventType: event.type,
      status: result.status,
      httpStatus: result.httpStatus,
      error: sanitizeDeliveryError(result.error),
      attempt,
      nextRetryAt: result.status === "failed" ? nextRetryAt : undefined,
      maxAttempts: WEBHOOK_MAX_ATTEMPTS
    }))
  );

  await WebhookEndpoint.updateMany(
    {
      ...(event.developerUserId
        ? { developerUserId: event.developerUserId }
        : { accountId: event.accountId }),
      webhookId: { $in: results.map((result) => result.webhookId) }
    },
    { $set: { lastTriggeredAt: new Date() } }
  );

  if (!failed) {
    await markEventCompleted(event.eventId);
    return "completed" as const;
  }

  if (attempt >= WEBHOOK_MAX_ATTEMPTS) {
    await WebhookEventModel.updateOne(
      { eventId: event.eventId, status: "processing" },
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
    return "failed" as const;
  }

  await WebhookEventModel.updateOne(
    { eventId: event.eventId, status: "processing" },
    {
      $set: { status: "pending", nextAttemptAt: nextRetryAt, lastError },
      $unset: { processingStartedAt: "" }
    }
  );
  return "retried" as const;
}

async function deliverToEndpoint({
  url,
  secretHash,
  webhookId,
  eventId,
  rawBody
}: {
  url: string;
  secretHash: string;
  webhookId: string;
  eventId: string;
  rawBody: string;
}): Promise<DeliveryResult> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signWebhookPayload(secretHash, timestamp, rawBody);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "BehalfID-Event-ID": eventId,
        "BehalfID-Timestamp": timestamp,
        "BehalfID-Signature": `v1=${signature}`
      },
      body: rawBody,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS)
    });

    if (response.ok) {
      return { webhookId, status: "success", httpStatus: response.status };
    }

    return {
      webhookId,
      status: "failed",
      httpStatus: response.status,
      error: `Endpoint returned HTTP ${response.status}.`
    };
  } catch (error) {
    return {
      webhookId,
      status: "failed",
      error: error instanceof Error ? error.message : "Delivery failed."
    };
  }
}

function nextAttemptAt(attempt: number) {
  const delay = WEBHOOK_BACKOFF_MS[Math.min(attempt, WEBHOOK_BACKOFF_MS.length - 1)];
  return new Date(Date.now() + delay);
}

async function markEventCompleted(eventId: string) {
  await WebhookEventModel.updateOne(
    { eventId, status: "processing" },
    {
      $set: {
        status: "completed",
        deadLetter: false,
        lastError: null,
        completedAt: new Date(),
        nextAttemptAt: new Date()
      },
      $unset: { processingStartedAt: "" }
    }
  );
}

export function sanitizeDeliveryError(error?: string) {
  if (!error) {
    return undefined;
  }

  return error
    .replace(/bhf_sk_[A-Za-z0-9_-]+/g, "bhf_sk_[redacted]")
    .replace(/whsec_[A-Za-z0-9_-]+/g, "whsec_[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/(authorization|cookie|set-cookie)=([^;\s]+)/gi, "$1=[redacted]")
    .slice(0, 500);
}

function summarizeDeliveryErrors(results: DeliveryResult[]) {
  const errors = results
    .filter((result) => result.status === "failed")
    .map((result) => `${result.webhookId}: ${sanitizeDeliveryError(result.error) ?? "Delivery failed."}`);

  return errors.join("; ").slice(0, 500);
}
