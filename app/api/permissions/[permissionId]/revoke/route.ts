import { type NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { accountScopeFilter } from "@/lib/accountAccess";
import {
  agentCannotGrantPermissions,
  canRevokePermission,
  getWorkspaceActor,
  permissionGrantForbidden,
  viewerMutationForbidden
} from "@/lib/delegatedAuth";
import { connectToDatabase } from "@/lib/db";
import { requireHumanDeveloperApi } from "@/lib/humanAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Permission from "@/models/Permission";

type RouteContext = {
  params: Promise<{ permissionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { permissionId } = await context.params;
  if (!permissionId) {
    return jsonError("permissionId is required.");
  }

  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  await connectToDatabase();

  const humanAuth = await requireHumanDeveloperApi(request);
  if (humanAuth.user && !humanAuth.error) {
    const accountId = humanAuth.account?.accountId ?? humanAuth.user.primaryAccountId;
    const actor = await getWorkspaceActor(humanAuth.user.userId, accountId);
    if (!actor) return jsonError("Workspace account required.", 403);
    if (actor.authorityLevel <= 10) return viewerMutationForbidden();

    const permission = await Permission.findOne({
      permissionId,
      ...accountScopeFilter(actor.accountId)
    });
    if (!permission) return jsonError("Permission not found.", 404);
    if (!canRevokePermission(actor, permission)) {
      return permissionGrantForbidden();
    }

    if (permission.status !== "revoked") {
      permission.status = "revoked";
      permission.updatedBy = humanAuth.user.userId;
      await permission.save();
    }

    await emitWebhookEvent(
      createWebhookEvent(actor.accountId, "permission.revoked", {
        permissionId,
        agentId: permission.agentId,
        action: permission.action
      }, humanAuth.user.userId)
    );

    return Response.json({ revoked: true });
  }

  const auth = await authenticateApiKey(request);
  if (auth.error || !auth.agent) {
    return jsonError(auth.error, 401);
  }

  return agentCannotGrantPermissions();
}
