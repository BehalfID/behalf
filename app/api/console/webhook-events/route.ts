import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import WebhookEvent from "@/models/WebhookEvent";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const accountId = await getConsoleAccountId();
  const status = request.nextUrl.searchParams.get("status");
  const type = request.nextUrl.searchParams.get("type");
  const deadLetter = request.nextUrl.searchParams.get("deadLetter");
  const query: Record<string, unknown> = { accountId };

  if (status && ["pending", "processing", "completed", "failed"].includes(status)) {
    query.status = status;
  }

  if (type) {
    query.type = type;
  }

  if (deadLetter === "true") {
    query.deadLetter = true;
  }

  const events = await WebhookEvent.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .select("-_id eventId type status attempts nextAttemptAt deadLetter lastError completedAt createdAt updatedAt")
    .lean();

  return NextResponse.json({ events });
}
