import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import { getConsoleAuditActor, requireConsoleApi } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/consoleAdmins";
import { getConsoleAccountId } from "@/lib/consoleData";
import { createApiKey } from "@/lib/ids";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import { updateAgent } from "@/lib/repositories/agents";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { agentId } = await context.params;
  const accountId = await getConsoleAccountId();
  const apiKey = createApiKey();
  const result = await updateAgent(
    { accountId, agentId },
    {
      $set: {
        apiKeyHash: hashApiKey(apiKey),
        keyRotatedAt: new Date()
      },
      $unset: { lastUsedAt: "" }
    }
  );
  if (result.matchedCount !== 1) {
    return jsonError("Agent not found.", 404);
  }

  await emitWebhookEvent(createWebhookEvent(accountId, "agent.key_rotated", { agentId }));
  await recordAdminAudit({
    adminId: getConsoleAuditActor(request),
    action: "agent.key_rotated",
    target: agentId
  });

  return NextResponse.json({ agentId, apiKey });
}
