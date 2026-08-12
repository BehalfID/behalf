import { NextResponse, type NextRequest } from "next/server";
import { getConsoleSessionActorId, requireConsoleApi } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/consoleAdmins";
import { getConsoleAccountId } from "@/lib/consoleData";
import { jsonError } from "@/lib/responses";
import { updateEndpoint } from "@/lib/repositories/webhooks";

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
  const result = await updateEndpoint(
    { accountId, webhookId },
    { $set: { status: "active" } }
  );

  if (result.matchedCount !== 1) {
    return jsonError("Webhook not found.", 404);
  }

  await recordAdminAudit({
    adminId: getConsoleSessionActorId(request),
    action: "webhook.enabled",
    target: webhookId
  });

  return NextResponse.json({ enabled: true });
}
