import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { accountScopeFilter } from "@/lib/accountAccess";
import {
  canRevokePermission,
  getWorkspaceActor,
  permissionGrantForbidden,
  viewerMutationForbidden
} from "@/lib/delegatedAuth";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Permission from "@/models/Permission";

type RouteContext = {
  params: Promise<{ agentId: string; permissionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { agentId, permissionId } = await context.params;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const permission = await Permission.findOne({
    ...accountScopeFilter(actor.accountId),
    agentId,
    permissionId
  });
  if (!permission) return jsonError("Permission not found.", 404);

  if (!canRevokePermission(actor, permission)) {
    return actor.authorityLevel <= 10 ? viewerMutationForbidden() : permissionGrantForbidden();
  }

  if (permission.status !== "revoked") {
    permission.status = "revoked";
    permission.updatedBy = auth.user.userId;
    await permission.save();
  }

  await emitWebhookEvent(
    createWebhookEvent(null, "permission.revoked", { permissionId, agentId, action: permission.action }, auth.user.userId)
  );

  return NextResponse.json({ revoked: true });
}
