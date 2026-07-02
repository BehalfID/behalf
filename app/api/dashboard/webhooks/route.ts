import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
import { checkWebhooksEnabled, quotaErrorDetails } from "@/lib/quota";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { rejectUnknownFields } from "@/lib/validation";
import {
  createSigningSecret,
  validateWebhookEvents,
  validateWebhookUrl,
  WEBHOOK_EVENT_TYPES
} from "@/lib/webhooks";
import WebhookEndpoint from "@/models/WebhookEndpoint";
import { getQuotas, type Plan } from "@/lib/plans";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const plan = (auth.account?.plan ?? "free") as Plan;
  const quotas = getQuotas(plan);
  const webhooks = await WebhookEndpoint.find({
    developerUserId: auth.user.userId,
    ...(auth.activeAccountId ? { accountId: auth.activeAccountId } : {})
  })
    .sort({ createdAt: -1 })
    .select("-_id webhookId url secretPreview events status lastTriggeredAt createdAt updatedAt")
    .lean();
  return noCacheJson({
    webhooks,
    eventTypes: WEBHOOK_EVENT_TYPES,
    plan,
    webhooksEnabled: quotas.webhooksEnabled,
    upgradeHint: quotas.webhooksEnabled ? null : "Upgrade to Pro to enable webhook delivery."
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const webhookQuota = checkWebhooksEnabled(auth.account?.plan);
  if (!webhookQuota.allowed) {
    return jsonError(webhookQuota.reason ?? "Webhooks are not available on this plan.", 403, quotaErrorDetails(webhookQuota));
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["url", "events"]);
  if (unknownError) return jsonError(unknownError);

  const { url, error: urlError } = validateWebhookUrl(body.url);
  if (urlError || !url) return jsonError(urlError ?? "Invalid webhook URL.");
  const { events, error: eventsError } = validateWebhookEvents(body.events);
  if (eventsError || !events) return jsonError(eventsError ?? "Invalid webhook events.");

  const signing = createSigningSecret();
  const webhook = await WebhookEndpoint.create({
    webhookId: createPublicId("wh"),
    accountId: auth.account?.accountId ?? auth.activeAccountId ?? auth.user.userId,
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
