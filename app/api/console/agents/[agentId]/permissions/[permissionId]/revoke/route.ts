import { NextResponse, type NextRequest } from "next/server";
import { getConsoleSessionActorId, requireConsoleApi } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/consoleAdmins";
import { getConsoleAccountId } from "@/lib/consoleData";
import { findOnePermission, revokePermission } from "@/lib/repositories/permissions";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";

type RouteContext = {
  params: Promise<{ agentId: string; permissionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { agentId, permissionId } = await context.params;
  const accountId = await getConsoleAccountId();
  const permission = await findOnePermission({ accountId, agentId, permissionId });
  if (!permission) {
    return jsonError("Permission not found.", 404);
  }

  if (permission.status !== "revoked") {
    await revokePermission(permissionId, { accountId });
  }

  await emitWebhookEvent(
    createWebhookEvent(accountId, "permission.revoked", {
      permissionId,
      agentId,
      action: permission.action
    })
  );

  await recordAdminAudit({
    adminId: getConsoleSessionActorId(request),
    action: "agent.permission_revoked",
    target: agentId,
    metadata: { permissionId, action: permission.action }
  });

  return NextResponse.json({ revoked: true });
}
