import { type NextRequest } from "next/server";
import { agentAuthJsonError } from "@/lib/appErrors";
import { authenticateApiKey } from "@/lib/auth";
import { accountScopeFilter } from "@/lib/accountAccess";
import {
  agentCannotGrantPermissions,
  canRevokePermission,
  getWorkspaceActor,
  permissionGrantForbidden,
  viewerMutationForbidden
} from "@/lib/delegatedAuth";
import { requireHumanDeveloperApi } from "@/lib/humanAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import {
  findOnePermission,
  revokePermission
} from "@/lib/repositories/permissions";
import { jsonError } from "@/lib/responses";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";

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

  const humanAuth = await requireHumanDeveloperApi(request);
  if (humanAuth.user && !humanAuth.error) {
    const accountId = humanAuth.account?.accountId ?? humanAuth.user.primaryAccountId;
    const actor = await getWorkspaceActor(humanAuth.user.userId, accountId);
    if (!actor) return jsonError("Workspace account required.", 403);
    if (actor.authorityLevel <= 10) return viewerMutationForbidden();

    const permission = await findOnePermission({
      permissionId,
      ...accountScopeFilter(actor.accountId)
    });
    if (!permission) return jsonError("Permission not found.", 404);
    if (!canRevokePermission(actor, permission)) {
      return permissionGrantForbidden();
    }

    if (permission.status !== "revoked") {
      await revokePermission(
        permissionId,
        accountScopeFilter(actor.accountId),
        humanAuth.user.userId
      );
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
    return agentAuthJsonError(auth.error);
  }

  return agentCannotGrantPermissions();
}
