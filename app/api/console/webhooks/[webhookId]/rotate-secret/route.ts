import { NextResponse, type NextRequest } from "next/server";
import { getConsoleAuditActor, requireConsoleApi } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/consoleAdmins";
import { getConsoleAccountId } from "@/lib/consoleData";
import { updateEndpoint } from "@/lib/repositories/webhooks";
import { jsonError } from "@/lib/responses";
import { createSigningSecret } from "@/lib/webhooks";

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
  const result = await updateEndpoint(
    { accountId, webhookId },
    { $set: { secretHash: signing.secretHash, secretPreview: signing.secretPreview } }
  );

  if (result.matchedCount !== 1) {
    return jsonError("Webhook not found.", 404);
  }

  await recordAdminAudit({
    adminId: getConsoleAuditActor(request),
    action: "webhook.secret_rotated",
    target: webhookId
  });

  return NextResponse.json({ webhookId, secret: signing.secret, secretPreview: signing.secretPreview });
}
