import dns from "dns/promises";
import http from "http";
import https from "https";
import type { IncomingMessage } from "http";
import { connectToDatabase } from "@/lib/db";
import { createPublicId } from "@/lib/ids";
import {
  isPrivateIpAddress,
  signWebhookPayload,
  validateWebhookUrl,
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
  const allowedUrl = await validateDeliveryUrl(url);

  if (allowedUrl.error || !allowedUrl.url || !allowedUrl.pinnedAddress) {
    return {
      webhookId,
      status: "failed",
      error: allowedUrl.error ?? "Webhook URL is not allowed."
    };
  }

  try {
    const response = await postWithPinnedAddress({
      url: allowedUrl.url,
      pinnedAddress: allowedUrl.pinnedAddress,
      headers: {
        "Content-Type": "application/json",
        "BehalfID-Event-ID": eventId,
        "BehalfID-Timestamp": timestamp,
        "BehalfID-Signature": `v1=${signature}`
      },
      body: rawBody
    });

    if (response.status >= 300 && response.status < 400) {
      return {
        webhookId,
        status: "failed",
        httpStatus: response.status,
        error: "Endpoint returned a redirect, which is not followed for webhook delivery."
      };
    }

    if (response.status >= 200 && response.status < 300) {
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

type PinnedAddress = { address: string; family: number };

async function validateDeliveryUrl(url: string) {
  const validation = validateWebhookUrl(url);
  if (validation.error || !validation.url) {
    return { url: null, pinnedAddress: null, error: validation.error ?? "Webhook URL is not allowed." };
  }
  const deliveryUrl = validation.url;

  const hostname = new URL(deliveryUrl).hostname;
  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length) {
      return { url: null, pinnedAddress: null, error: "Webhook URL host could not be resolved." };
    }

    if (addresses.some((address) => isPrivateIpAddress(address.address))) {
      return { url: null, pinnedAddress: null, error: "Webhook URL resolved to a private or reserved address." };
    }

    return { url: deliveryUrl, pinnedAddress: addresses[0] as PinnedAddress, error: null };
  } catch {
    return { url: null, pinnedAddress: null, error: "Webhook URL host could not be resolved." };
  }
}

function postWithPinnedAddress({
  url,
  pinnedAddress,
  headers,
  body
}: {
  url: string;
  pinnedAddress: PinnedAddress;
  headers: Record<string, string>;
  body: string;
}): Promise<{ status: number }> {
  const parsed = new URL(url);
  const client = parsed.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const bodyBuffer = Buffer.from(body, "utf8");
    const req = client.request(
      parsed,
      {
        method: "POST",
        timeout: DELIVERY_TIMEOUT_MS,
        headers: {
          ...headers,
          "Content-Length": String(bodyBuffer.byteLength)
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, pinnedAddress.address, pinnedAddress.family);
        }
      },
      (res: IncomingMessage) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0 });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Webhook delivery timed out."));
    });
    req.on("error", (err) => {
      reject(err.message === "Webhook delivery timed out." ? err : new Error("Delivery failed."));
    });
    req.write(bodyBuffer);
    req.end();
  });
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
