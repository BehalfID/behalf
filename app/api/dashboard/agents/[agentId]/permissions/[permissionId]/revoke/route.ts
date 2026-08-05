import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { accountScopeFilter } from "@/lib/accountAccess";
import {
  canRevokePermission,
  getWorkspaceActor,
  permissionGrantForbidden,
  viewerMutationForbidden
} from "@/lib/delegatedAuth";
import { findOnePermission, revokePermission } from "@/lib/repositories/permissions";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";

type RouteContext = {
  params: Promise<{ agentId: string; permissionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { agentId, permissionId } = await context.params;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const permission = await findOnePermission({
    ...accountScopeFilter(actor.accountId),
    agentId,
    permissionId
  });
  if (!permission) return jsonError("Permission not found.", 404);

  if (!canRevokePermission(actor, permission)) {
    return actor.authorityLevel <= 10 ? viewerMutationForbidden() : permissionGrantForbidden();
  }

  if (permission.status !== "revoked") {
    await revokePermission(permissionId, accountScopeFilter(actor.accountId), auth.user.userId);
  }

  // Scope the event to the authorized workspace. Passing `null` made
  // `createWebhookEvent` substitute the developer's user id for the account id,
  // which violates the `webhook_events.account_id` foreign key on Postgres.
  await emitWebhookEvent(
    createWebhookEvent(
      actor.accountId,
      "permission.revoked",
      { permissionId, agentId, action: permission.action },
      auth.user.userId
    )
  );

  return NextResponse.json({ revoked: true });
}
