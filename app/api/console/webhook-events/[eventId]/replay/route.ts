import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import { jsonError } from "@/lib/responses";
import WebhookEvent from "@/models/WebhookEvent";

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { eventId } = await context.params;
  const accountId = await getConsoleAccountId();
  const event = await WebhookEvent.findOneAndUpdate(
    {
      accountId,
      eventId,
      status: "failed",
      deadLetter: true
    },
    {
      $set: {
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        deadLetter: false,
        lastError: null,
        completedAt: null
      },
      $unset: { processingStartedAt: "" }
    },
    {
      returnDocument: "after"
    }
  )
    .select("-_id eventId status attempts nextAttemptAt deadLetter lastError completedAt")
    .lean();

  if (!event) {
    const processingEvent = await WebhookEvent.exists({ accountId, eventId, status: "processing" });
    if (processingEvent) {
      return jsonError("Webhook event is currently processing and cannot be replayed.", 409);
    }

    const existingEvent = await WebhookEvent.exists({ accountId, eventId });
    if (existingEvent) {
      return jsonError("Only dead-lettered webhook events can be replayed.", 409);
    }

    return jsonError("Webhook event not found.", 404);
  }

  return NextResponse.json({ replayed: true, event });
}
