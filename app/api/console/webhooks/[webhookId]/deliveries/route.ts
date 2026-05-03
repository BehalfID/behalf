import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import WebhookDelivery from "@/models/WebhookDelivery";

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
  const deliveries = await WebhookDelivery.find({ accountId, webhookId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("-_id deliveryId eventId eventType status httpStatus error attempt nextRetryAt maxAttempts createdAt")
    .lean();

  return NextResponse.json({ deliveries });
}
