import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { checkWebhooksEnabled, quotaErrorDetails } from "@/lib/quota";
import { jsonError } from "@/lib/responses";
import WebhookEndpoint from "@/models/WebhookEndpoint";

type RouteContext = {
  params: Promise<{ webhookId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const webhookQuota = checkWebhooksEnabled(auth.account?.plan);
  if (!webhookQuota.allowed) {
    return jsonError(webhookQuota.reason ?? "Webhooks are not available on this plan.", 403, quotaErrorDetails(webhookQuota));
  }
  const { webhookId } = await context.params;
  const result = await WebhookEndpoint.updateOne(
    { developerUserId: auth.user.userId, webhookId },
    { $set: { status: "active" } }
  );
  if (result.matchedCount !== 1) return jsonError("Webhook not found.", 404);
  return NextResponse.json({ enabled: true });
}
