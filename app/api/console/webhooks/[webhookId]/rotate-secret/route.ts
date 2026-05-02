import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import { jsonError } from "@/lib/responses";
import { createSigningSecret } from "@/lib/webhooks";
import WebhookEndpoint from "@/models/WebhookEndpoint";

type RouteContext = {
  params: Promise<{ webhookId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { webhookId } = await context.params;
  const accountId = await getConsoleAccountId();
  const signing = createSigningSecret();
  const result = await WebhookEndpoint.updateOne(
    { accountId, webhookId },
    { $set: { secretHash: signing.secretHash, secretPreview: signing.secretPreview } }
  );

  if (result.matchedCount !== 1) {
    return jsonError("Webhook not found.", 404);
  }

  return NextResponse.json({ webhookId, secret: signing.secret, secretPreview: signing.secretPreview });
}
