import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import { jsonError } from "@/lib/responses";
import WebhookDelivery from "@/models/WebhookDelivery";
import WebhookEvent from "@/models/WebhookEvent";

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { eventId } = await context.params;
  const accountId = await getConsoleAccountId();
  const event = await WebhookEvent.findOne({ accountId, eventId })
    .select("-_id eventId type payload status attempts nextAttemptAt deadLetter lastError completedAt createdAt updatedAt")
    .lean();

  if (!event) {
    return jsonError("Webhook event not found.", 404);
  }

  const deliveries = await WebhookDelivery.find({ accountId, eventId })
    .sort({ createdAt: -1 })
    .limit(100)
    .select("-_id deliveryId webhookId eventId eventType status httpStatus error attempt nextRetryAt maxAttempts createdAt")
    .lean();

  return NextResponse.json({ event, deliveries });
}
