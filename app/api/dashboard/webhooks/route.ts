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
import { effectiveEntitlements, effectivePlan } from "@/lib/planGrants";
import { createEndpoint, listEndpoints } from "@/lib/repositories/webhooks";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const plan = effectivePlan(auth.account);
  const entitlements = effectiveEntitlements(auth.account);
  const webhooks = await listEndpoints({
    developerUserId: auth.user.userId,
    ...(auth.activeAccountId ? { accountId: auth.activeAccountId } : {})
  }, { sort: { createdAt: -1 }, select: "-_id webhookId url secretPreview events status lastTriggeredAt createdAt updatedAt" });
  return noCacheJson({
    webhooks,
    eventTypes: WEBHOOK_EVENT_TYPES,
    plan,
    webhooksEnabled: entitlements.webhooksEnabled,
    upgradeHint: entitlements.webhooksEnabled ? null : "Upgrade to Pro to enable webhook delivery."
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  // Endpoints registered here receive account-scoped events, including activity
  // for agents the registrant does not own, so registering one is a mutation a
  // read-only VIEWER must not be able to perform.
  const workspace = await requireWorkspaceMutationActor(auth.user, auth.activeAccountId);
  if (workspace.error) return workspace.error;

  const webhookQuota = checkWebhooksEnabled(auth.account);
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
  const webhook = await createEndpoint({
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
