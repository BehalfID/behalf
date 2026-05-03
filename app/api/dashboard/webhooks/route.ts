import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
import { jsonError } from "@/lib/responses";
import { isRecord, rejectUnknownFields } from "@/lib/validation";
import {
  createSigningSecret,
  validateWebhookEvents,
  validateWebhookUrl,
  WEBHOOK_EVENT_TYPES
} from "@/lib/webhooks";
import WebhookEndpoint from "@/models/WebhookEndpoint";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const webhooks = await WebhookEndpoint.find({ developerUserId: auth.user.userId })
    .sort({ createdAt: -1 })
    .select("-_id webhookId url secretPreview events status lastTriggeredAt createdAt updatedAt")
    .lean();
  return NextResponse.json({ webhooks, eventTypes: WEBHOOK_EVENT_TYPES });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["url", "events"]);
  if (unknownError) return jsonError(unknownError);

  const { url, error: urlError } = validateWebhookUrl(body.url);
  if (urlError || !url) return jsonError(urlError ?? "Invalid webhook URL.");
  const { events, error: eventsError } = validateWebhookEvents(body.events);
  if (eventsError || !events) return jsonError(eventsError ?? "Invalid webhook events.");

  const signing = createSigningSecret();
  const webhook = await WebhookEndpoint.create({
    webhookId: createPublicId("wh"),
    accountId: auth.user.userId,
    developerUserId: auth.user.userId,
    url,
    secretHash: signing.secretHash,
    secretPreview: signing.secretPreview,
    events,
    status: "active"
  });

  return NextResponse.json({
    webhook: {
      webhookId: webhook.webhookId,
      url: webhook.url,
      secretPreview: webhook.secretPreview,
      events: webhook.events,
      status: webhook.status,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt
    },
    secret: signing.secret
  }, { status: 201 });
}
