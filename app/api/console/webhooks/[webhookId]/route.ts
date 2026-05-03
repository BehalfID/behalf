import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import { jsonError } from "@/lib/responses";
import WebhookDelivery from "@/models/WebhookDelivery";
import WebhookEndpoint from "@/models/WebhookEndpoint";

type RouteContext = {
  params: Promise<{ webhookId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { webhookId } = await context.params;
  const accountId = await getConsoleAccountId();
  const webhook = await WebhookEndpoint.findOne({ accountId, webhookId })
    .select("-_id webhookId url secretPreview events status lastTriggeredAt createdAt updatedAt")
    .lean();

  if (!webhook) {
    return jsonError("Webhook not found.", 404);
  }

  const deliveries = await WebhookDelivery.find({ accountId, webhookId })
    .sort({ createdAt: -1 })
    .limit(25)
    .select("-_id deliveryId eventId eventType status httpStatus error attempt nextRetryAt maxAttempts createdAt")
    .lean();

  return NextResponse.json({ webhook, deliveries });
}
